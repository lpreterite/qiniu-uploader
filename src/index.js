import cookies from 'js-cookie'
import axios from "axios"
import {
    crc,
    handle,
    errorHandle,
    urlsafeBase64,
    getFileKey,
    initBlock,
    initChunk
} from "./helper"

class Uploader{
    source = null
    options = {
        url: '//up.qiniu.com',           //上传地址
        blockSize: 1<<22,                //分块大小
        chunkSize: 1<<20,                //分片大小
        cookiePrefix: 'QINIU_UPLOAD::',  //缓存cookie前缀
        token: '',                       //上传凭证
        onValid: ({file, fileKey}, uploader)=>{ return [] },                                                   //文件检测钩子
        onBeforeUpload: ({file, fileKey}, uploader)=>{ return {file,fileKey} },                                //文件上传前钩子
        onUploadProgress: ({fileKey, loaded, total, progressStage, progressValue, blockIndex}, uploader)=>{},  //文件上传中钩子
        onUploaded: ({fileKey, result}, uploader)=>{},                                                         //文件上传成功钩子
        onFail: (errors, { isCancel }, uploader)=>{}                                                           //上传失败钩子
    }
    init(options){
        this.options = Object.assign(this.options, options)
    }
    openFinder(onFileChange = () => { }, options = { accept: '*' }) {
        const fileinput = document.createElement('input');
        fileinput.type = 'file';
        fileinput.accept = options.accept;
        fileinput.style.display = "none";
        fileinput.addEventListener('change', e => {
            onFileChange(e.target.files, this)
            fileinput.remove()
        }, false);
        document.body.append(fileinput);
        return fileinput.click();
    }
    getFileKey(blob){
        return getFileKey(blob, this.options.blockSize)
    }
    async upload(fileKey, blob, options = {}) {
        const { blockSize, chunkSize, token, onUploadProgress } = Object.assign(this.options, options);
        this.source = axios.CancelToken.source();
        const _onUploadProgress = (blob, stage, blockIndex, pointer) => progressEvent => {
            onUploadProgress({
                fileKey,
                loaded: pointer || progressEvent.loaded,
                total: blob.size,
                blockIndex,
                progressStage: stage,
                progressValue: Math.round(((pointer || progressEvent.loaded) / blob.size) * 100)
            }, this)
        }
        
        try{
            if (blob.size > blockSize) {
                // Chunk file upload
                let storage = cookies.get(this.options.cookiePrefix + fileKey)
                storage = storage ? JSON.parse(storage) : storage
                var pointer = typeof storage === 'undefined' ? 0 : Number(storage.pointer);
                var ctxList = typeof storage === 'undefined' ? [] : storage.ctxList;
                var ctx = typeof storage === 'undefined' ? null : storage.ctx;

                while (pointer < blob.size) {
                    const block = initBlock(blob, blockSize, pointer)
                    const chunk = initChunk(blob, chunkSize, pointer)

                    let result;
                    if (block.entire) {
                        result = await axios({
                            url: this.options.url + '/mkblk/' + block.size,
                            data: chunk.blob,
                            headers: {
                                'Content-Type': 'application/octet-stream',
                                'Authorization': 'UpToken ' + token
                            },
                            method: 'POST',
                            cancelToken: this.source.token,
                            onUploadProgress: _onUploadProgress(blob, 'mkblk', blob.size > blockSize ? Math.ceil(pointer / blockSize) : 1, pointer)
                        })
                    } else {
                        result = await axios({
                            url: this.options.url + `/bput/${ctx}/${block.offset}`,
                            data: chunk.blob,
                            headers: {
                                'Content-Type': 'application/octet-stream',
                                'Authorization': 'UpToken ' + token
                            },
                            method: 'POST',
                            cancelToken: this.source.token,
                            onUploadProgress: _onUploadProgress(blob, 'bput', blob.size > blockSize ? Math.ceil(pointer / blockSize) : 1, pointer)
                        })
                    }

                    ctx = result.data.ctx;

                    //block end
                    if (chunk.end % blockSize === 0 || chunk.end === blob.size) {
                        ctxList.push(ctx);
                    }
                    pointer = chunk.end;
                    cookies.set(this.options.cookiePrefix + fileKey, { pointer, ctxList, ctx });
                }

                result = await axios({
                    url: this.options.url + `/mkfile/${blob.size}/key/${urlsafeBase64(fileKey)}`,
                    data: ctxList.join(','),
                    headers: {
                        'Content-Type': 'text/plain',
                        'Authorization': 'UpToken ' + token
                    },
                    method: 'POST',
                    cancelToken: this.source.token,
                    onUploadProgress: _onUploadProgress(blob, 'mkfile', blob.size > blockSize ? Math.ceil(pointer / blockSize) : 1, pointer)
                })
                this.clean(fileKey)
                return result.data
            }else{
                // Single file upload
                const crc32 = await crc(blob);

                const data = new FormData();
                data.append('key', fileKey);
                data.append('file', blob);
                data.append('token', token);
                data.append('crc32', crc32);

                const result = await axios({
                    url: this.options.url + '/',
                    data,
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    },
                    method: 'POST',
                    cancelToken: this.source.token,
                    onUploadProgress: _onUploadProgress(blob, 'uploading', 1)
                })
                return result.data
            }
        }catch(e){
            this.options.onFail([e], { isCancel: axios.isCancel(e) }, this)
        }
    }
    cancel(fileKey, message="") {
        return this.source.cancel(message);
    }
    clean(fileKey){
        if (typeof fileKey === 'undefined'){
            Object
                .keys(cookies.get())
                .filter(key => key.indexOf(this.options.cookiePrefix)>-1)
                .forEach(key => cookies.remove(key))
        }else{
            cookies.remove(this.options.cookiePrefix + fileKey);
        }
    }
}

export default new Uploader()