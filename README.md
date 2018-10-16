# qiniu-uploader

基于现代浏览器的七牛上传前端插件

- [x] 生成唯一名
- [x] 分片上传
- [x] 断点续传

## How to use

```js
//打开文件选择器
const token = "七牛上传授权token"
uploader.openFinder(async (files, uploader)=>{
    const fileKey = await uploader.getFileKey(file)
    uploader.upload(fileKey, files[0], { token })
});

//手动取消上传
uploader.cancel()
```

## 功能

```js
//初次化
uploader.init(options)
//打开文件选择框
uploader.openFinder((files,uploader)=>{})
//获得文件唯一名
uploader.getFileKey(file)
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

## 疑问与坑

1. 目前分片上传三接口（mkblock、bput、mkfile）均不能捕获错误码（具体原因是未查明，只知道xhr.status为0并提示链接请求错误，如：ERR_CONTENT_LENGTH_MISMATCH），遇到此类情况统一返回错误（信息头为000的错误信息）
2. 单个文件上传的文件名称不需要UrlsafeBase64处理
