// import "babel-polyfill"
import cookies from 'js-cookie'
import axios from "axios"
import {
    crc,
    urlsafeBase64,
    getFileKey,
    initBlock,
    initChunk,
    getBlockCount
} from "./helper"

const defaults = {
    progress: {
        fileKey: "",
        blob: null,
        loaded: 0,
        total: 0,
        blockIndex: 1,
        blockCount: 1,
        value: 0,
        stage: "uploading",
        uploading: false,
        cancelTokenSource: null,
        errors: []
    },
    options: {
        url: '//up.qiniu.com',           //上传地址
        blockSize: 1 << 22,                //分块大小
        chunkSize: 1 << 20,                //分片大小
        cookiePrefix: 'QINIU_UPLOAD::',  //缓存cookie前缀
        token: '',                       //上传凭证
        onValid: ({ file, fileKey }, uploader) => { return [] },                        //文件检测钩子
        onBeforeUpload: ({ file, fileKey }, uploader) => { return { file, fileKey } },  //文件上传前钩子
        onUploadProgress: (progress, uploader) => { },                                  //文件上传中钩子
        onUploaded: ({ fileKey, result }, uploader) => { },                             //文件上传成功钩子
        onFail: (errors, { isCancel }, uploader) => { },                                //上传失败钩子
        onChanged: ()=>{}                                                               //更新文件状态
    }
}

class Uploader{
    fileset = new Map()
    options = Object.assign({}, defaults.options)
    init(options){
        this.options = Object.assign(this.options, options)
    }
    _onChanged(fileKey, progress){
        this.fileset.set(fileKey, progress)
        this.options.onChanged(progress)
    }
    openFinder(onFileChange = () => { }, options) {
        options = Object.assign({ accept: '*', multiple: false }, options)
        const fileinput = document.createElement('input');
        fileinput.type = 'file';
        fileinput.accept = options.accept;
        fileinput.style.display = "none";
        fileinput.multiple = options.multiple;
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
    getFile(fileKey){
        return this.fileset.get(fileKey)
    }
    getAllFile() {
        return Array.from(this.fileset.values())
    }
    addFile(fileKey, blob, options){
        options = Object.assign({}, defaults.progress, {
            fileKey,
            blob,
            total: blob.size,
            blockIndex: 1,
            blockCount: getBlockCount(blob.size, this.options.blockSize),
            stage: "beforeUpload"
        })
        return this._onChanged(fileKey, options)
    }
    removeFile(fileKey){
        const setting = this.fileset.get(fileKey)
        if (setting.cancelTokenSource) setting.cancelTokenSource.cancel()
        this.cleanStorage(fileKey)
        return this.fileset.remove(fileKey)
    }
    async upload(fileKey, options = {}) {
        const setting = this.fileset.get(fileKey)
        const { blob } = setting
        const { blockSize, chunkSize, token, onUploadProgress } = Object.assign(this.options, options);
        const cancelTokenSource = setting.cancelTokenSource = axios.CancelToken.source();

        const _onUploadProgress = setting => progressEvent => this._onChanged(setting.fileKey, Object.assign(setting, {
            total: setting.blockCount > 1 ? setting.total : progressEvent.total,
            loaded: setting.blockCount > 1 ? setting.loaded : progressEvent.loaded,
            value: setting.blockCount > 1 ? Math.floor(setting.loaded / setting.total * 100) : Math.floor(progressEvent.loaded / progressEvent.total * 100)
        }))
        
        try{
            if (blob.size > blockSize) {
                // Chunk file upload
                let storage = cookies.get(this.options.cookiePrefix + fileKey)
                storage = storage ? JSON.parse(storage) : storage
                var pointer = typeof storage === 'undefined' ? 0 : Number(storage.pointer);
                var ctxList = typeof storage === 'undefined' ? [] : storage.ctxList;
                var ctx = typeof storage === 'undefined' ? null : storage.ctx;
                var result;

                while (pointer < blob.size) {
                    const block = initBlock(blob, blockSize, pointer)
                    const chunk = initChunk(blob, chunkSize, pointer)
                    const blockIndex = blob.size > blockSize ? Math.ceil(pointer / blockSize) : 1
                    if (block.entire) {
                        result = await axios({
                            url: this.options.url + '/mkblk/' + block.size,
                            data: chunk.blob,
                            headers: {
                                'Content-Type': 'application/octet-stream',
                                'Authorization': 'UpToken ' + token
                            },
                            method: 'POST',
                            cancelToken: cancelTokenSource.token,
                            onUploadProgress: _onUploadProgress(Object.assign(setting, { stage: 'uploading::mkblk', loaded: pointer, blockIndex, uploading: true}))
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
                            cancelToken: cancelTokenSource.token,

                            onUploadProgress: _onUploadProgress(Object.assign(setting, { stage: 'uploading::bput', loaded: pointer, blockIndex, uploading: true }))
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
                    cancelToken: cancelTokenSource.token,
                    onUploadProgress: _onUploadProgress(Object.assign(setting, { stage: 'uploading::mkfile', loaded: pointer, blockIndex: setting.blockCount, uploading: true }))
                })
                this.cleanStorage(fileKey)
                this._onChanged(fileKey, Object.assign(setting, { stage: 'uploaded', uploading: false }))
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
                    cancelToken: cancelTokenSource.token,
                    onUploadProgress: _onUploadProgress(Object.assign(setting, { loaded: pointer, blockIndex: setting.blockCount }))
                })
                this._onChanged(fileKey, Object.assign(setting, { stage: 'uploaded', uploading: false }))
                return result.data
            }
        }catch(e){
            const isCancel = axios.isCancel(e)
            setting.uploading = false
            if (!isCancel) setting.errors = [e]
            this._onChanged(fileKey, setting)
            this.options.onFail([e], { isCancel }, this)
        }
    }
    cancel(fileKey, message="") {
        const setting = this.fileset.get(fileKey)
        this._onChanged(fileKey, Object.assign(setting, { stage: 'cancel', uploading: false }))
        return setting.cancelTokenSource ? setting.cancelTokenSource.cancel(message) : false
    }
    clean(){
        this.fileset.forEach((key)=>{
            this.cleanStorage(key)
        })
        this.fileset = new Map()
    }
    cleanStorage(fileKey) {
        if (typeof fileKey === 'undefined') {
            Object
                .keys(cookies.get())
                .filter(key => key.indexOf(this.options.cookiePrefix) > -1)
                .forEach(key => cookies.remove(key))
        } else {
            cookies.remove(this.options.cookiePrefix + fileKey);
        }
    }
}

export default new Uploader()