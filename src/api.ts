import axios from 'axios';
import qs from 'qs';

const apiFactory = axios.create({
    timeout: 30000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    baseURL: '/',
    withCredentials: true,
});

apiFactory.interceptors.request.use(
    (config) => {
        const { data, method } = config;
        config.data = qs.stringify(data);
        return config;
    },
    function (error) {
        return Promise.reject(error);
    }
);

const ApiCall = (config = {}) => {
    const options = {
        method: 'get',
        ...config,
    };
    return new Promise((resolve, reject) => {
        apiFactory(options)
            .then((cliResp) => {
                const resp = cliResp.data;
                if (resp.status) {
                    resolve(resp.data);
                } else {
                    reject({ message: resp.message });
                }
            })
            .catch((e) => {
                reject({ message: '网络错误，请重试', error: e });
            });
    });
};

const createApiClient =
    (config = {}) =>
    ({ ...args }) =>
        ApiCall({ ...config, ...args });

export default {
    InitGame: createApiClient({
        url: '/api/init',
    }),
    StartGame: createApiClient({
        url: '/api/game/start',
    }),
    FinishGame: createApiClient({
        url: '/api/game/finish',
        method: 'post',
    }),
    GetRankList: createApiClient({
        url: '/api/game/rank',
    }),
    ChangeName: createApiClient({
        url: '/api/change_name',
        method: 'post',
    }),
};
