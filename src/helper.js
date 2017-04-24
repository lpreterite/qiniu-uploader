import cookies from 'js-cookie';
import crypto from 'crypto';
import { buf } from 'crc-32';
import { Buffer } from 'buffer';
import { encode as base64encode } from 'base-64';
import { utf16to8 } from './utf';

function sha1(content){
    var sha1 = crypto.createHash('sha1');
    sha1.update(content);
    return sha1.digest();
}

export class Progress{
    constructor(opts){
        this.options = {
            total: 0,
            blockSize: 0,
            ...opts
        }
        this._pointer = 0;
        this._stage = '';
    }
    _getProgressValue(stage, pointer){
        let baseValue = 0;

        switch(stage){
            case 'upload:mkblock':
            case 'upload:bput':
            case 'upload:mkfile':
            case 'access:key':
                baseValue = 10;
                break;
            case 'upload':
            case 'uploaded':
                baseValue = 20;
                break;
        }

        return Math.round( ( pointer / this.options.total )*80 ) + baseValue;
    }
    _currentBlockIndex(pointer){
        return this.options.total > this.options.blockSize ? Math.ceil(pointer / this.options.blockSize) : 1;
    }
    stage(stage){
        this._stage = stage;
        return this;
    }
    overall(pointer){
        this._pointer = typeof pointer === 'undefined' ? this._pointer : pointer;
        return {
            progress: {
                value: this._getProgressValue(this._stage, this._pointer),
                stage: this._stage
            },
            block: {
                index: this._currentBlockIndex(this._pointer)
            },
            total: this.options.total,
            uploaded: this._pointer
        }
    }
}

export const defaults = {
    cookiePrefix: 'QINIU_UPLOAD::',
    blockSize: 1 << 22,
    chunkSize: 1 << 20
};

export class UploadHelper{
    constructor(opts){
        if(typeof FileReader === 'undefined') throw new Error('您的浏览器不支持大文件上传');
        this.options = Object.assign({}, defaults, opts);
    }
    blockSize(){
        return this.options.blockSize;
    }
    block(blob, pointer = 0){
        const offset = pointer % this.options.blockSize;
        return {
            size: pointer + this.options.blockSize > blob.size ? blob.size - pointer : this.options.blockSize,
            offset: offset,
            entire: offset === 0
        }
    }
    chunk(blob, pointer = 0){
        const chunkEnd = Math.min(pointer + this.options.chunkSize, blob.size);
        return {
            blob: blob.slice(pointer, chunkEnd),
            start: pointer,
            end: chunkEnd
        };
    }
    isBlockEnd(blob, pointer){
        return pointer % this.options.blockSize === 0 || pointer === blob.size;
    }
    async crc(blob){
        let arrayBuf = await this.toArrayBuffer(blob);
        let data = new Uint8Array(arrayBuf);
        let crc = buf(data) >>> 0;
        return crc;
    }
    toArrayBuffer(blob){
        return new Promise((resolve, reject)=>{
            let reader = new FileReader();
            reader.onloadend = function(e) {
                if (e.target.readyState == FileReader.DONE) { // DONE == 2
                    resolve(e.target.result);
                }
            };
            reader.onerror = function(e) {
                reject(e.target.error);
            };
            reader.readAsArrayBuffer(blob);
        });
    }
    blockCount(blobSize){
        return Math.ceil(blobSize / this.options.blockSize);
    }
    async sha1String(blob){
        let sha1String = [];
        let blockCount = this.blockCount(blob.size);
        for(var i=0;i<blockCount;i++){
            const start = i*this.options.blockSize;
            let end = (i+1)*this.options.blockSize;
            end = end > blob.size ? blob.size : end;
            let arrayBuf = await this.toArrayBuffer(blob.slice(start,end));
            sha1String.push(sha1(new Buffer(arrayBuf)));
        }
        return {sha1String, blockCount};
    }
    async calcEtag(blob){
        const {sha1String, blockCount} = await this.sha1String(blob);

        if(!sha1String.length) return 'Fto5o-5ea0sNMlW_75VgGJCv2AcJ';

        let sha1Buffer = Buffer.concat(sha1String,blockCount * 20);
        let prefix = 0x16;

        // 如果大于4M，则对各个块的sha1结果再次sha1
        if(blockCount > 1){
            prefix = 0x96;
            sha1Buffer = sha1(sha1Buffer);
        }

        sha1Buffer = Buffer.concat(
            [new Buffer([prefix]),sha1Buffer],
            sha1Buffer.length + 1
        );

        return sha1Buffer.toString('base64')
            .replace(/\//g,'_').replace(/\+/g,'-');
    }
    async getKey(blob){
        const etag = await this.calcEtag(blob);
        console.log('etag:', etag);
        return base64encode(utf16to8(etag));
    }
    saveStorage(key, val){
        cookies.set(this.options.cookiePrefix+key, val);
    }
    getStorage(key){
        const val = cookies.get(this.options.cookiePrefix+key);
        return val ? JSON.parse(val) : val;
    }
    removeStorage(key){
        cookies.remove(defaults.cookiePrefix+key);
    }
}