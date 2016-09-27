import sauceConnectLauncher from "sauce-connect-launcher";

export const USE_SAUCE = process.env["USE_SAUCE"];
const SAUCE_USERNAME = process.env["SAUCE_USERNAME"];
const SAUCE_ACCESS_KEY = process.env["SAUCE_ACCESS_KEY"];
const CIRCLE_BUILD_NUM = process.env["CIRCLE_BUILD_NUM"];

export const sauceCapabilities = {
    browserName: 'chrome',
    platform: 'Mac',
    version: '48.0',
    username: SAUCE_USERNAME,
    accessKey: SAUCE_ACCESS_KEY,
    build: CIRCLE_BUILD_NUM
};

export const sauceServer = `http://${SAUCE_USERNAME}:${SAUCE_ACCESS_KEY}@localhost:4445/wd/hub`;

export const startSauceConnect = (config = {
    username: SAUCE_USERNAME,
    accessKey: SAUCE_ACCESS_KEY
}) => {
    return new Promise((resolve, reject) => {
        sauceConnectLauncher(config, function (err, sauceConnectProcess) {
            if (err) {
                reject(err);
            } else {
                resolve({
                    close: () =>
                        new Promise((resolve, reject) =>
                            sauceConnectProcess.close(resolve)
                        )
                });
            }
        });
    });
};
