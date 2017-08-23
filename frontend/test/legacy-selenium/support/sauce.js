import sauceConnectLauncher from "sauce-connect-launcher";

import createSharedResource from "./shared-resource";

export const USE_SAUCE = process.env["USE_SAUCE"];
const SAUCE_USERNAME = process.env["SAUCE_USERNAME"];
const SAUCE_ACCESS_KEY = process.env["SAUCE_ACCESS_KEY"];
const CIRCLE_BUILD_NUM = process.env["CIRCLE_BUILD_NUM"];

export const sauceServer = `http://${SAUCE_USERNAME}:${SAUCE_ACCESS_KEY}@localhost:4445/wd/hub`;

export const sauceCapabilities = {
    browserName: 'chrome',
    version: '52.0',
    platform: 'macOS 10.12',
    username: SAUCE_USERNAME,
    accessKey: SAUCE_ACCESS_KEY,
    build: CIRCLE_BUILD_NUM
};

export const sauceConnectConfig = {
    username: SAUCE_USERNAME,
    accessKey: SAUCE_ACCESS_KEY
}

export const SauceConnectResource = createSharedResource("SauceConnectResource", {
    defaultOptions: sauceConnectConfig,
    create(options) {
        return {
            options,
            promise: null
        };
    },
    async start(sauce) {
        if (USE_SAUCE) {
            if (!sauce.promise) {
                sauce.promise = new Promise((resolve, reject) => {
                    sauceConnectLauncher(sauce.options, (err, proc) =>
                        err ? reject(err) : resolve(proc)
                    );
                });
            }
            return sauce.promise;
        }
    },
    async stop(sauce) {
        if (sauce.promise) {
            let p = sauce.promise;
            delete sauce.promise;
            return p.then(proc => proc.close())
        }
    }
});
