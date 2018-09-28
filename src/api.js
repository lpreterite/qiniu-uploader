import axios from 'axios';
import { RequestControl } from './helper';

export default function (host) {
    const instance = new axios.create({
        baseURL: host || '//up.qiniu.com'
    });
    return {
        instance: instance,
        uploadfile(formData) {
            return new RequestControl({
                instance,
                url: '/',
                data: formData,
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
        },
        mkblock(token, block, chunk) {
            return new RequestControl({
                instance,
                url: '/mkblk/' + block.size,
                data: chunk.blob,
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Authorization': 'UpToken ' + token
                }
            });
        },
        bput(token, block, chunk, bctx) {
            return new RequestControl({
                instance,
                url: `/bput/${bctx}/${block.offset}`,
                data: chunk.blob,
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Authorization': 'UpToken ' + token
                }
            });
        },
        mkfile(token, key, ctxList, size) {
            return new RequestControl({
                instance,
                url: `/mkfile/${size}/key/${key}`,
                data: ctxList,
                headers: {
                    'Content-Type': 'text/plain',
                    'Authorization': 'UpToken ' + token
                }
            });
        }
    };
}