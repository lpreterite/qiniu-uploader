# qiniu-uploader

基于现代浏览器的七牛上传前端插件

- [x] 生成唯一名
- [x] 分片上传
- [x] 断点续传

## How to use

```js
import { UploadManager, getFileKey } from 'qiniu-uploader';

const blockSize = 1<<22;
const uploadManager = new UploadManager({ blockSize });
const fileKey = await getFileKey(file, blockSize);

// 创建一个上传组件
const uploader = uploadManager.getUploader(fileKey, file, token);
uploader.onprogress((uploader)=>{
    const total = Math.floor((uploader.status.total || 0) / 1024);
    const uploaded = Math.floor((uploader.status.uploaded || 0) / 1024);
    const blockIndex = uploader.status.block.index;
    console.log(`上传进度：${uploader.progress.value}% - ${uploaded}kb / ${total}kb —— 当前块：${blockIndex} 当前阶段：${uploader.progress.stage}`);
});

// 上传
uploader
    .action()
    .then(()=>{
        console.log('上传成功');
    })
    .catch(err=>{
        if(e.message.indexOf('000')) console.error('上传出现意外错误');
        else if(e.message.indexOf('401')) console.error('未授权或授权过期，请检测token');
        else console.error(e.message);
    });

// 清除分片上传记录
uploader.clear(fileKey);
```

## 疑问与坑

1. 目前分片上传三接口（mkblock、bput、mkfile）均不能捕获错误码（具体原因是未查明，只知道xhr.status为0并提示链接请求错误，如：ERR_CONTENT_LENGTH_MISMATCH），遇到此类情况统一返回错误（信息头为000的错误信息）
2. 单个文件上传的文件名称不需要UrlsafeBase64处理
