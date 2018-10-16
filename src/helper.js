import cookies from 'js-cookie';
import crypto from 'crypto';
import { buf } from 'crc-32';
import { Buffer } from 'buffer';
import { encode as base64encode } from 'base-64';
import { utf16to8 } from './utf';
import axios from 'axios';

const ERROR_NETORK = '000';
export function handle(ctx) {
    return Promise.resolve(ctx.data);
}
export function errorHandle(err) {
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
        // console.time(`toArrayBuffer|${start}:${end}`)
        let arrayBuf = await toArrayBuffer(blob.slice(start, end));
        // console.timeEnd(`toArrayBuffer|${start}:${end}`)
        sha1String.push(sha1(new Buffer(arrayBuf)));
    }
    return sha1String
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
    const blockCount = getBlockCount(blob.size, blockSize)
    const sha1String = await getSha1String(blob, blockSize);

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