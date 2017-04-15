import { Builder, WebDriver } from "selenium-webdriver";
import { USE_SAUCE, sauceCapabilities, sauceServer } from './sauce';

import createSharedResource from "./shared-resource";

const SESSION_URL = process.env["WEBDRIVER_SESSION_URL"];
const SESSION_ID = process.env["WEBDRIVER_SESSION_ID"];
const USE_EXISTING_SESSION = SESSION_URL && SESSION_ID;

export const getConfig = ({ name }) => {
    if (USE_SAUCE) {
        return {
            capabilities: {
                ...sauceCapabilities,
                name: name
            },
            server: sauceServer
        };
    } else {
        return {
            capabilities: {
                name: name
            },
            browser: "chrome"
        };
    }
}

export const WebdriverResource = createSharedResource("WebdriverResource", {
    defaultOptions: {},
    getKey(options) {
        return JSON.stringify(getConfig(options))
    },
    create(options) {
        let config = getConfig(options);
        return {
            config
        };
    },
    async start(webdriver) {
        if (!webdriver.driver) {
            if (USE_EXISTING_SESSION) {
                const _http = require('selenium-webdriver/http');

                const client = new _http.HttpClient(SESSION_URL, null, null);
                const executor = new _http.Executor(client);

                webdriver.driver = await WebDriver.attachToSession(executor, SESSION_ID);
            } else {
                let builder = new Builder();
                if (webdriver.config.capabilities) {
                    builder.withCapabilities(webdriver.config.capabilities);
                }
                if (webdriver.config.server) {
                    builder.usingServer(webdriver.config.server);
                }
                if (webdriver.config.browser) {
                    builder.forBrowser(webdriver.config.browser);
                }
                webdriver.driver = builder.build();
            }
        }
    },
    async stop(webdriver) {
        if (webdriver.driver) {
            const driver = webdriver.driver;
            delete webdriver.driver;

            if (!USE_EXISTING_SESSION) {
                await driver.quit();
            }
        }
    }
});
