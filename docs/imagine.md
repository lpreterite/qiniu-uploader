# 设计构想

## 必要数据

- `token` 根据七牛提供的密钥及存储空间名字计算出来用于授权接口的票据
- `file` 需上传的文件
- `blockSize` 文件过大需要分片时用到，大文件先切块再切片上传，每个块可看作一个文件的概念，这里指切块的大小（byte）
- `fileKey` 文件于存储空间存储时的名称，建议使用七牛提供的算法换算的唯一名做记录。

`fileKey`使用七牛提供的算法换算的唯一名做记录有利于数据存储，当同一个文件再次上传时，换算文件唯一名后用本地服务检索就能知道是否存在相同文件，使用此种方法便能减少不必要的上传开销，对用户也有较好的使用体现。

## 发送文件的始发点

文件上传行为在相对简单的系统下，发送文件这个行为的始发点一般在业务层代码中（就是页面的代码中）。在较复杂的系统中发生文件的始发点可能在公共层或者组件逻辑层下进行。举个例子，使用Vue框架开发的情况下，存在需要全局显示上传进度及上传队列的情况下，文件发送的行为将会发生在vuex相关的代码里（公共层），便于监控文件上传进度的数据变化。

## 必要数据获得来源

|            | token | file | blockSize | fileKey |
|------------|-------|------|-----------|---------|
| 公共层     | ✔     |      | ✔         | ✔       |
| 业务层     | ✔     |      | ✔         | ✔       |
| 组件逻辑层 |       | ✔    | ✔         |         |

有些数据内容是不变的（如`blockSize`），大多是会根据需要进行改变，`token`过时失效后需要重新获得，每次选择的文件不同也会导致`file`不同，`file`不同导致唯一名的`fileKey`也会变化，所以理清数据间的关系能在设计程序时去掉不必要的输入提供必要的考量。

关于分层的描述：

- 公共层：代指全局或实例创建前的代码统称
- 业务层：字面上能理解是写业务代码统称，一般指页面逻辑层部分的代码
- 组件逻辑层：基于组件的独立代码统称

## 目的与使用

以下几点为此次改版目的：

- 提供发送文件的逻辑提供可变支持，目前考虑以重构方法的方式设计
- 单一运行时，旧版设计为每个上传文件提供执行实现，此种方法较为耗能并不推荐，目前需考虑按设置运行上传，然后提供相应的回调函数
- 提供多个版本构建包
- 提供基于vue框架下的使用样例，包括简单使用和全局处理方式

### 使用猜想

#### 简单情景：上传按钮

```js
//打开文件选择器
uploader.openFinder(async (files, uploader)=>{
    const fileKey = await uploader.getFileKey(file)
    uploader.upload(fileKey, files[0], {
        onValid({file, fileKey}, uploader)=>{ return [] },
        onBeforeUpload({file, fileKey}, uploader)=>{ return {file,fileKey} },
        onUploadProgress({fileKey, loaded, total, progressStage, progressValue, blockIndex}, uploader)=>{},
        onUploaded({fileKey, result, errors}, uploader)=>{},
    })
});

//手动取消上传
uploader.cancel()

```

#### 复杂的情景：全局监控

stores/modules/storage.js

```js
import axios from "axios"
import uploader from "@packy-tang/qiniu-uploader"
function buckestSchema(){
    return {
        name: '',
        url: '',
        domain: '',
        token: '',
        expired: 0
    }
}
function fileSchema(){
    return {
        key: '',
        value: '',
        blob: null,
        type: 'wait'
        onUploaded: ()=>{}
    }
}

const url = 'http://up-z2.qiniup.com'

uploader.init({
    url,
    onValid({file, fileKey}, uploader)=>{ return [] },
    onBeforeUpload({file, fileKey}, uploader)=>{ return {file,fileKey} },
    onUploadProgress({fileKey, loaded, total, progressStage, progressValue, blockIndex}, uploader)=>{},
})

export default {
    state: {
        url,
        buckest: {},
        fileset: {}
    },
    mutations: {
        setBucket(state, {type, bucket}){
            state.buckets[type] = bucket;
        },
        updateProgress(state, {key,value}){
            state.fileset[key] = { ...state.fileset[key], value }
        },
        addFile(state, {key, blob, value, onUploaded}){
            state.fileset[key] = {...fileSchema(), key, blob, value, onUploaded}
        },
        uploadFile(state, key){
            const { blob, onUploaded } = state.fileset[key]
            uploader.upload(key, blob, {
                onUploadProgress({progressValue}){
                    state.fileset[fileKey].value = progressValue
                    state.fileset[fileKey].type = 'loading'
                },
                onUploaded({fileKey, result, errors}, uploader)=>{
                    if(errors.length > 0){
                        state.fileset[fileKey].type = 'error'
                        throw errors[0]
                    }
                    state.fileset[fileKey].value = 100
                    state.fileset[fileKey].type = 'success'
                    onUploaded({fileKey, result, errors}, uploader)
                }
            })
        }
    },
    actions: {
        async fetchBucket({commit}, bucketName){
            const bucket = await axios.get(`/storage/${bucketName}`)
            commit('setBucket', {...bucketSchema(),...bucket})
        }
    }
}
```

page/photo.vue

```html
<template>
    <button @click="uploader.openFinder(onFileChanged)">选择文件</button>
    <ul>
        <li v-for="setting in $store.state.storage.fileset">
            <div>filekey: {{ setting.key }}</div>
            <div>progess: {{ setting.value }}</div>
            <div>type: {{ setting.type }}</div>
        </li>
    </ul>
</template>
<script>
export default {
    methods: {
        onFileChanged(files, uploader){
            const fileset = files.map(async file=>{
                return {
                    key: await uploader.getFileKey(file),
                    blob: file
                }
            })
            fileset.forEach(setting=>this.$store.commit('addFile', setting))
            this.$store.commit('uploadFile', fileset[0].key)
        }
    }
}
</script>
```

大致功能：

```js
//初次化
uploader.init(options)
//打开文件选择框
uploader.openFinder((files,uploader)=>{})
//上传文件
uploader.upload(fileKey, file, options)
//取消文件上传
uploader.cancel(fileKey)
//清除文件分片缓存
uploader.clean(fileKey)

// options
const options = {
    url: '',                         //上传地址
    blockSize: 1<<22,                //分块大小
    chunkSize: 1<<20,                //分片大小
    cookiePrefix: 'QINIU_UPLOAD::',  //缓存cookie前缀
    token: '',                       //上传凭证
    onValid({file, fileKey}, uploader)=>{ return [] },                                                   //文件检测钩子
    onBeforeUpload({file, fileKey}, uploader)=>{ return {file,fileKey} },                                //文件上传前钩子
    onUploadProgress({fileKey, loaded, total, progressStage, progressValue, blockIndex}, uploader)=>{},  //文件上传中钩子
    onUploaded({fileKey, result}, uploader)=>{},                                                         //文件上传成功钩子
    onFail((errors, { isCancel }, uploader)=>{})                                                                   //上传失败钩子
}
```