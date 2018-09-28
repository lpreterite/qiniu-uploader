import cookies from 'js-cookie';
import crypto from 'crypto';
import { buf } from 'crc-32';
import { Buffer } from 'buffer';
import { encode as base64encode } from 'base-64';
import { utf16to8 } from './utf';
import axios from 'axios';
import Api from './api';

const ERROR_NETORK = '000';
function handle(ctx) {
    return Promise.resolve(ctx.data);
}
function errorHandle(err) {
    if (axios.isCancel(err)) {
        err.message = 'cancel:' + err.message;
        err.cancel = true;
    } else if (err.response) {
        err.message = err.response.status + ':' + err.response.data.error;
    } else {
        err.message = ERROR_NETORK + ':' + err.message;
    }
    return Promise.reject(err);
}

export const defaults = {
    cookiePrefix: 'QINIU_UPLOAD::',
    blockSize: 1 << 22,
    chunkSize: 1 << 20
};
export const api = Api();


export function sha1(content) {
    var sha1 = crypto.createHash('sha1');
    sha1.update(content);
    return sha1.digest();
}

export function getBlockCount(blobSize, blockSize) {
    return Math.ceil(blobSize / blockSize);
}

export async function getSha1String(blob, blockSize) {
    let sha1String = [];
    let blockCount = getBlockCount(blob.size, blockSize);
    for (var i = 0; i < blockCount; i++) {
        const start = i * blockSize;
        let end = (i + 1) * blockSize;
        end = end > blob.size ? blob.size : end;
        let arrayBuf = await toArrayBuffer(blob.slice(start, end));
        sha1String.push(sha1(new Buffer(arrayBuf)));
    }
    return { sha1String, blockCount };
}

export function toArrayBuffer(blob) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onloadend = function (e) {
            if (e.target.readyState == FileReader.DONE) { // DONE == 2
                resolve(e.target.result);
            }
        };
        reader.onerror = function (e) {
            reject(e.target.error);
        };
        reader.readAsArrayBuffer(blob);
    });
}

export async function getFileKey(blob, blockSize) {
    //calcEtag
    const { sha1String, blockCount } = await getSha1String(blob, blockSize);

    if (!sha1String.length) return 'Fto5o-5ea0sNMlW_75VgGJCv2AcJ';

    let sha1Buffer = Buffer.concat(sha1String, blockCount * 20);
    let prefix = 0x16;

    // 如果大于4M，则对各个块的sha1结果再次sha1
    if (blockCount > 1) {
        prefix = 0x96;
        sha1Buffer = sha1(sha1Buffer);
    }

    sha1Buffer = Buffer.concat(
        [new Buffer([prefix]), sha1Buffer],
        sha1Buffer.length + 1
    );

    return sha1Buffer.toString('base64')
        .replace(/\//g, '_').replace(/\+/g, '-');
}

export function initBlock(blob, blockSize, pointer = 0) {
    const offset = pointer % blockSize;
    return {
        size: pointer + blockSize > blob.size ? blob.size - pointer : blockSize,
        offset: offset,
        entire: offset === 0
    }
}
export function initChunk(blob, chunkSize, pointer = 0) {
    const chunkEnd = Math.min(pointer + chunkSize, blob.size);
    return {
        blob: blob.slice(pointer, chunkEnd),
        start: pointer,
        end: chunkEnd
    };
}
export function isBlockEnd(blob, blockSize, pointer) {
    return pointer % blockSize === 0 || pointer === blob.size;
}
export async function crc(blob) {
    const arrayBuf = await toArrayBuffer(blob);
    const data = new Uint8Array(arrayBuf);
    const crc = buf(data) >>> 0;
    return crc;
}
export function urlsafeBase64(etag) {
    return base64encode(utf16to8(etag));
}
export function saveStorage(key, val) {
    cookies.set(defaults.cookiePrefix + key, val);
}
export function getStorage(key) {
    const val = cookies.get(defaults.cookiePrefix + key);
    return val ? JSON.parse(val) : val;
}
export function removeStorage(key) {
    cookies.remove(defaults.cookiePrefix + key);
}

export class RequestControl {
    constructor(opts) {
        this.instance = opts.instance;
        opts.instance = undefined;
        delete opts.instance;

        this.source = axios.CancelToken.source();
        this.options = {
            ...opts,
            method: 'POST',
            cancelToken: this.source.token
        };
    }
    progress(onUploadProgress = () => { }) {
        this.options.onUploadProgress = onUploadProgress;
        return this;
    }
    action() {
        return this.instance(this.options).then(handle, errorHandle);
    }
    cancel(message) {
        return this.source.cancel(message);
    }
}

export class Progress {
    constructor(opts) {
        this.options = {
            total: 0,
            blockSize: 0,
            ...opts
        }
        this._pointer = 0;
        this._stage = '';
    }
    _getProgressValue(stage, pointer) {
        let baseValue = 0;

        switch (stage) {
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

        return Math.round((pointer / this.options.total) * 80) + baseValue;
    }
    _currentBlockIndex(pointer) {
        return this.options.total > this.options.blockSize ? Math.ceil(pointer / this.options.blockSize) : 1;
    }
    stage(stage) {
        this._stage = stage;
        return this;
    }
    overall(pointer) {
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


export class UploadControl {
    constructor({ fileKey, blob, token, blockSize, chunkSize }) {
        this._fileKey = fileKey;
        this._blob = blob;
        this._token = token;
        this._blockSize = blockSize ? blockSize : defaults.blockSize;
        this._chuckSize = chunkSize ? chunkSize : defaults.chunkSize;
        this._progress = new Progress({ total: blob.size, blockSize });
        this._status = {
            progress: {
                value: 0,
                stage: 'init'
            },
            total: blob.size
        }
        this._requestControl = null;
        this._onprogress = () => { };
        this._canceled = false;
    }
    _updateStatus(status) {
        this._status = status;
        this._onprogress(this);
    }
    action() {
        return Promise.reject('nothing...');
    }
    cancel() {
        if (!this._requestControl) return false;
        this._requestControl.cancel(`${this._blob.name} upload is stop!`);
        this._canceled = true;
    }
    getFileKey() {
        return this._fileKey;
    }
    clear(fileKey) {
        removeStorage(fileKey);
    }
    onprogress(cb) {
        this._onprogress = cb;
    }
    get file() {
        return this._blob;
    }
    get status() {
        return this._status;
    }
    get progress() {
        return this._status.progress;
    }
    get loading() {
        return this.canceled ? false : this.progress.value < 100;
    }
    get cached() {
        return !!getStorage(this._fileKey);
    }
    get canceled() {
        return this._canceled;
    }
}

export class SingleUploadControl extends UploadControl {
    constructor(...opts) {
        super(...opts);
    }
    async action(token) {
        this._canceled = false;
        token = token || this._token;
        if (typeof FormData === 'undefined') {
            //TODO: upload base64 data
        } else {
            const crc32 = await crc(this._blob);
            this._updateStatus(this._progress.stage('key').overall());
            const key = this._fileKey ? this._fileKey : await getFileKey(this._blob, this._blockSize);
            this._updateStatus(this._progress.stage('access:key').overall());

            const data = new FormData();
            data.append('key', key);
            data.append('file', this._blob);
            data.append('token', token);
            data.append('crc32', crc32);

            this._requestControl = api.uploadfile(data).progress(progressEvent => {
                this._updateStatus(
                    this._progress.stage('upload').overall(progressEvent.loaded)
                );
            });

            this._updateStatus(this._progress.stage('upload:mkfile').overall());
            const result = await this._requestControl.action();
            this._updateStatus(this._progress.stage('uploaded').overall());
            return result;
        }
    }
}

export class ChunkUploadControl extends UploadControl {
    constructor(...opts) {
        super(...opts);
    }
    async action(token) {
        this._canceled = false;
        token = token || this._token;
        const filesize = this._blob.size;
        this._updateStatus(this._progress.stage('key').overall());
        const key = this._fileKey ? this._fileKey : await getFileKey(this._blob, this._blockSize);
        this._updateStatus(this._progress.stage('access:key').overall());

        const storage = getStorage(key);
        console.log(storage);
        let pointer = typeof storage === 'undefined' ? 0 : Number(storage.pointer);
        let ctxList = typeof storage === 'undefined' ? [] : storage.ctxList;
        let ctx = typeof storage === 'undefined' ? null : storage.ctx;

        while (pointer < filesize) {
            const block = initBlock(this._blob, this._blockSize, pointer);
            const chunk = initChunk(this._blob, this._chuckSize, pointer);

            let result;
            if (block.entire) {
                this._requestControl = api.mkblock(token, block, chunk);
                result = await this._requestControl.progress(progressEvent => {
                    this._updateStatus(
                        this._progress.stage('upload:mkblock').overall(progressEvent.loaded + pointer)
                    );
                }).action();
            } else {
                this._requestControl = api.bput(token, block, chunk, ctx);
                result = await this._requestControl.progress(progressEvent => {
                    this._updateStatus(
                        this._progress.stage('upload:bput').overall(progressEvent.loaded + pointer)
                    );
                }).action();
            }

            ctx = result.ctx;

            if (isBlockEnd(this._blob, this._blockSize, chunk.end)) {
                ctxList.push(ctx);
            }
            pointer = chunk.end;

            saveStorage(key, { pointer, ctxList, ctx });
        }

        this._updateStatus(this._progress.stage('upload:mkfile').overall());
        this._requestControl = api.mkfile(token, urlsafeBase64(key), ctxList.join(','), this._blob.size);
        const result = await this._requestControl.action();
        this._updateStatus(this._progress.stage('uploaded').overall());

        return result;
    }
}

export class UploadManager {
    constructor(...opts) {
        this.options = {
            blockSize: defaults.blockSize,
            chunkSize: defaults.chunkSize,
            ...opts
        };
    }
    getUploader(fileKey, blob, token) {
        let { blockSize, chunkSize } = this.options;

        if (blob.size > blockSize) {
            return new ChunkUploadControl({ fileKey, blob, token, blockSize, chunkSize });
        } else {
            return new SingleUploadControl({ fileKey, blob, token, blockSize, chunkSize });
        }
    }
}
