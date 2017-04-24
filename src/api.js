import axios from 'axios';

const ERROR_NETORK = '000';

function handle(ctx){
    return Promise.resolve(ctx.data);
}
function errorHandle(err){
    if(err.response){
        err.message = err.response.status+':'+err.response.data.error;
    }else{
        err.message = ERROR_NETORK+':'+err.message;
    }
    return Promise.reject(err);
}

export default function(host){
    const instance = new axios.create({
        baseURL: host || '//up.qiniu.com'
    });
    return {
        instance: instance,
        uploadfile(formData, onUploadProgress){
            return instance.post('/', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress
            }).then(handle, errorHandle);
        },
        mkblock(token, block, chunk, onUploadProgress){
            return instance.post('/mkblk/'+block.size, chunk.blob, {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Authorization': 'UpToken ' + token
                },
                onUploadProgress
            }).then(handle, errorHandle);
        },
        bput(token, block, chunk, bctx, onUploadProgress){
            return instance.post(`/bput/${bctx}/${block.offset}`, chunk.blob, {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Authorization': 'UpToken ' + token
                },
                onUploadProgress
            }).then(handle, errorHandle);
        },
        mkfile(token, key, ctxList, size, onUploadProgress){
            return instance.post(`/mkfile/${size}/key/${key}`, ctxList, {
                headers: {
                    'Content-Type': 'text/plain',
                    'Authorization': 'UpToken ' + token
                },
                onUploadProgress
            }).then(handle, errorHandle);
        }
    };
}