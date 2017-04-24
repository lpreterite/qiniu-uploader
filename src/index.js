import Api from './api';
import { UploadHelper, Progress } from './helper';

const defaults = {
    onprogress(){}
};

export default class UploadManager{
    constructor(){
        this._progress = null;
        this._api = Api();
        this._helper = new UploadHelper();
    }
    async upload(blob, token, options){
        options = Object.assign(defaults, options);
        this._progress = new Progress({ total:blob.size, blockSize: this._helper.blockSize() });

        let result;

        try{
            if(blob.size > this._helper.blockSize()){
                result = await this.uploadBigFile(blob, token, options);
            }else{
                result = await this.uploadSingleFile(blob, token, options);
            }
        }catch(e){
            return e;
        }

        return result;
    }
    async uploadSingleFile(blob, token, options){
        if(typeof FormData === 'undefined'){
            //TODO: upload base64 data
        }else{
            const crc32 = await this._helper.crc(blob);
            options.onprogress( this._progress.stage('key').overall() );
            const key = await this._helper.calcEtag(blob);
            options.onprogress( this._progress.stage('access:key').overall() );

            const data = new FormData();
            data.append('key', key);
            data.append('file', blob);
            data.append('token', token);
            data.append('crc32', crc32);
            
            return this._api.uploadfile(data, progressEvent=>{
                options.onprogress(
                    this._progress.stage('upload').overall(progressEvent.loaded)
                );
            });
        }
    }
    async uploadBigFile(blob, token, options){
        const filesize = blob.size;
        options.onprogress( this._progress.stage('key').overall() );
        const key = await this._helper.getKey(blob);
        options.onprogress( this._progress.stage('access:key').overall() );

        const storage = this._helper.getStorage(key);
        let pointer = typeof storage === 'undefined' ? 0 : Number(storage.pointer);
        let ctxList = typeof storage === 'undefined' ? [] : storage.ctxList;
        let ctx = typeof storage === 'undefined' ? null : storage.ctx;

        while(pointer < filesize){
            const block = this._helper.block(blob, pointer);
            const chunk = this._helper.chunk(blob, pointer);

            let result;
            if(block.entire){
                result = await this._api.mkblock(token, block, chunk, progressEvent=>{
                    options.onprogress(
                        this._progress.stage('upload:mkblock').overall(progressEvent.loaded + pointer)
                    );
                });
            }else{
                result = await this._api.bput(token, block, chunk, ctx, progressEvent=>{
                    options.onprogress(
                        this._progress.stage('upload:bput').overall(progressEvent.loaded + pointer)
                    );
                });
            }

            ctx = result.ctx;

            if(this._helper.isBlockEnd(blob, chunk.end)){
                ctxList.push(ctx);
            }
            pointer = chunk.end;
            
            this._helper.saveStorage(key, { pointer, ctxList, ctx });
        }

        options.onprogress( this._progress.stage('upload:mkfile').overall() );
        let res = await this._api.mkfile(token, key, ctxList.join(','), blob.size);
        options.onprogress( this._progress.stage('uploaded').overall() );

        return Promise.resolve(res);
    }
    async clearStorage(blob){
        const key = await this._helper.getKey(blob);
        this._helper.removeStorage(key);
    }
}