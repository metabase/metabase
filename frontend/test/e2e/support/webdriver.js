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
        let builder = new Builder();
        if (config.capabilities) {
            builder.withCapabilities(config.capabilities);
        }
        if (config.server) {
            builder.usingServer(config.server);
        }
        if (config.browser) {
            builder.forBrowser(config.browser);
        }
        return builder.build();
    },
    async start(driver) {
    },
    async stop(driver) {
        await driver.quit();
    }
});
