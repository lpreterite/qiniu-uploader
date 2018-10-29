# qiniu-uploader

[![npm version](https://img.shields.io/npm/v/@packy-tang/qiniu-uploader.svg)](https://www.npmjs.com/package/@packy-tang/qiniu-uploader)

基于现代浏览器的七牛上传前端插件

- [x] 生成唯一名
- [x] 分片上传
- [x] 断点续传

## How to use

### install

```sh
npm install -S @packy-tang/qiniu-uploader
```

### use

```js
import uploader from "@packy-tang/qiniu-uploader"
const token = "七牛上传授权token"

//打开文件选择器
uploader.openFinder((files, uploader)=>{
    const file = files[0]
    uploader.addFile(file.name, file)
    uploader.upload(file.name, {
        token,
        onUploadProgress(progress){
            console.log(`[${(progress.loaded/1024/1024).toFixed(2)}mb / ${(progress.total/1024/1024).toFixed(2)}mb]——${progress.value}%`)
        },
        onUploaded(){
            alert("上传成功")
        }
    })
})

//手动取消上传
uploader.cancel()
```

[更多例子](https://github.com/lpreterite/qiniu-uploader-example)

## 功能

```js
//初次化
uploader.init(options)
//打开文件选择框
uploader.openFinder((files,uploader)=>{})
//获得文件唯一名
uploader.getFileKey(file)
//添加上传文件
uploader.addFile(fileKey, file)
//移除上传文件（同时清除分片缓存）
uploader.removeFile(fileKey)
//上传文件
uploader.upload(fileKey, options)
//上传进度
uploader.getProgress(fileKey)
//取消文件上传
uploader.cancel(fileKey)
//清除所有文件状态
uploader.clean()
//清除分片
uploader.cleanStorage(fileKey)

// options
const options = {
    url: '',                         //上传地址
    blockSize: 1<<22,                //分块大小
    chunkSize: 1<<20,                //分片大小
    cookiePrefix: 'QINIU_UPLOAD::',  //缓存cookie前缀
    token: '',                       //上传凭证
    onValid: ({file, fileKey}, uploader)=>{ return [] },                     //文件检测钩子
    onBeforeUpload: ({file, fileKey}, uploader)=>{ return {file,fileKey} },  //文件上传前钩子
    onUploadProgress: (progress, uploader)=>{},                              //文件上传中钩子
    onUploaded: ({fileKey, result}, uploader)=>{},                           //文件上传成功钩子
    onFail: (errors, { isCancel }, uploader)=>{},                            //上传失败钩子
    onChanged: (progress)=>{}
}

// progress
const progress = {
    fileKey: "",             //文件名
    blob: null,              //文件
    loaded: 0,               //已上传(byte)
    total: 0,                //需上传(byte)
    blockIndex: 1,           //当前块
    blockCount: 1,           //总块数
    value: 0,                //进度
    stage: "uploading",      //阶段
    cancelTokenSource: null  //取消上传请求凭证（来自axios）
}
```
