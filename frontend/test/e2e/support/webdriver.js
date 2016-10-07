import { Builder } from "selenium-webdriver";
import { USE_SAUCE, sauceCapabilities, sauceServer } from './sauce';

import createSharedResource from "./shared-resource";

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
    },
    async stop(webdriver) {
        if (webdriver.driver) {
            const driver = webdriver.driver;
            delete webdriver.driver;
            await driver.quit();
        }
    }
});
