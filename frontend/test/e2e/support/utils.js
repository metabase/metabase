import fs from "fs-promise";
import path from "path";

import { By, until } from "selenium-webdriver";

import { Driver } from "webchauffeur";

const DEFAULT_TIMEOUT = 50000;

const delay = (timeout = 0) => new Promise((resolve) => setTimeout(resolve, timeout));

const log = (message) => {
    console.log(message);
};

export const findElement = (driver, selector) => {
    // consider looking into a better test reporter
    // default jasmine reporter leaves much to be desired
    log(`looking for element: ${selector}`);
    return driver.findElement(By.css(selector));
};

export const waitForElement = (driver, selector, timeout = DEFAULT_TIMEOUT) => {
    log(`waiting for element: ${selector}`);
    if (typeof selector === "string") {
        selector = By.css(selector);
    }
    return driver.wait(until.elementLocated(selector), timeout);
};

export const waitForElementRemoved = (driver, selector, timeout = DEFAULT_TIMEOUT) => {
    log(`waiting for element to be removed: ${selector}`);
    return driver.wait(() =>
        driver.findElements(By.css(selector)).then(elements => elements.length === 0)
    , timeout);
};

export const waitForElementText = async (driver, selector, expectedText, timeout = DEFAULT_TIMEOUT) => {
    if (!expectedText) {
        log(`waiting for element text: ${selector}`);
        return await waitForElement(driver, selector, timeout).getText();
    } else {
        log(`waiting for element text to equal ${expectedText}: ${selector}`);
        try {
            // Need the wait condition to findElement rather than once at start in case elements are added/removed
            await driver.wait(async () =>
                (await driver.findElement(By.css(selector)).getText()) === expectedText
            , timeout);
        } catch (e) {
            log(`element text for ${selector} was: ${await driver.findElement(By.css(selector)).getText()}`)
            throw e;
        }
    }
};

export const clickElement = (driver, selector) => {
    log(`clicking on element: ${selector}`)
    return findElement(driver, selector).click();
};

// waits for element to appear before clicking to avoid clicking too early
// prefer this over calling click() on element directly
export const waitForElementAndClick = async (driver, selector, timeout = DEFAULT_TIMEOUT) => {
    log(`waiting to click: ${selector}`);
    let element = await waitForElement(driver, selector, timeout);

    element = await driver.wait(until.elementIsVisible(element), timeout);
    element = await driver.wait(until.elementIsEnabled(element), timeout);

    // help with brittleness
    await driver.sleep(100);

    return await element.click();
};

export const waitForElementAndSendKeys = async (driver, selector, keys, timeout = DEFAULT_TIMEOUT) => {
    log(`waiting for element to send "${keys}": ${selector}`);
    const element = await waitForElement(driver, selector, timeout);
    await element.clear();
    return await element.sendKeys(keys);
};

export const waitForUrl = (driver, url, timeout = DEFAULT_TIMEOUT) => {
    log(`waiting for url: ${url}`);
    return driver.wait(async () => await driver.getCurrentUrl() === url, timeout);
};

const screenshotToHideSelectors = {
    "screenshots/setup-tutorial-main.png": [
        "#Greeting"
    ],
    "screenshots/qb.png": [
        ".LoadingSpinner"
    ],
    "screenshots/auth-login.png": [
        ".brand-boat"
    ]
};

export const screenshot = async (driver, filename) => {
    log(`taking screenshot: ${filename}`);
    const dir = path.dirname(filename);
    if (dir && !(await fs.exists(dir))){
        await fs.mkdir(dir);
    }

    // hide elements that are always in motion or randomized
    const hideSelectors = screenshotToHideSelectors[filename];
    if (hideSelectors) {
        await hideSelectors.map((selector) => driver.executeScript(`
            const element = document.querySelector("${selector}");
            if (!element) {
                return;
            }
            element.classList.add('hide');
        `));
    }

    // blur input focus to avoid capturing blinking cursor in diffs
    await driver.executeScript(`document.activeElement.blur();`);

    const image = await driver.takeScreenshot();
    await fs.writeFile(filename, image, 'base64');
};

export const screenshotFailures = async (driver) => {
    let result = jasmine.getEnv().currentSpecResult;
    if (result && result.failedExpectations.length > 0) {
        await screenshot(driver, "screenshots/failures/" + result.fullName.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
    }
}

export const getJson = async (driver, url) => {
    await driver.get(url);
    try {
        let source = await driver.getPageSource();
        return JSON.parse(source);
    } catch (e) {
        return null;
    }
}

export const checkLoggedIn = async (server, driver, email) => {
    let currentUser = await getJson(driver, `${server.host}/api/user/current`);
    return currentUser && currentUser.email === email;
}

export const ensureLoggedIn = async (server, driver, email, password) => {
    if (await checkLoggedIn(server, driver, email)) {
        console.log("already logged in");
        return;
    }
    console.log("logging in");
    await driver.get(`${server.host}/`);
    await driver.manage().deleteAllCookies();
    await driver.get(`${server.host}/`);
    await loginMetabase(driver, email, password);
    await waitForUrl(driver, `${server.host}/`);
}

export const loginMetabase = async (driver, email, password) => {
    await driver.wait(until.elementLocated(By.css("[name=email]")));
    await driver.findElement(By.css("[name=email]")).sendKeys(email);
    await driver.findElement(By.css("[name=password]")).sendKeys(password);
    await driver.manage().timeouts().implicitlyWait(1000);
    await driver.findElement(By.css(".Button.Button--primary")).click();
};

import { BackendResource, isReady } from "./backend";
import { WebdriverResource } from "./webdriver";
import { SauceConnectResource } from "./sauce";

export const describeE2E = (name, options, describeCallback) => {
    if (typeof options === "function") {
        describeCallback = options;
        options = {};
    }

    options = { name, ...options };

    let server = BackendResource.get({ dbKey: options.dbKey });
    let webdriver = WebdriverResource.get();
    let sauce = SauceConnectResource.get();

    describe(name, jasmineMultipleSetupTeardown(() => {
        beforeAll(async () => {
            await Promise.all([
                BackendResource.start(server),
                SauceConnectResource.start(sauce).then(()=>
                    WebdriverResource.start(webdriver)),
            ]);

            global.driver = webdriver.driver;
            global.d = new Driver(webdriver.driver);
            global.server = server;

            await driver.get(`${server.host}/`);
            await driver.manage().deleteAllCookies();
            await driver.manage().timeouts().implicitlyWait(100);
        });

        it ("should start", async () => {
            expect(await isReady(server.host)).toEqual(true);
        });

        describeCallback();

        afterEach(async () => {
            await screenshotFailures(webdriver.driver)
        });

        afterAll(async () => {
            delete global.driver;
            delete global.server;

            await Promise.all([
                BackendResource.stop(server),
                WebdriverResource.stop(webdriver),
                SauceConnectResource.stop(sauce),
            ]);
        });
    }));
}

// normally Jasmine only supports a single setup/teardown handler
// this monkey patches it to support multiple
function jasmineMultipleSetupTeardown(fn) {
    return function(...args) {
        // temporarily replace beforeAll etc with versions that can be called multiple times
        const handlers = { beforeAll: [], beforeEach: [], afterEach: [], afterAll: [] }
        const originals = {};

        // hook the global "describe" so we know if we're in an inner describe call,
        // since we only want to grab the top-level setup/teardown handlers
        let originalDescribe = global.describe;
        let innerDescribe = false;
        global.describe = (...args) => {
            innerDescribe = true;
            try {
                return originalDescribe.apply(this, args);
            } finally {
                innerDescribe = false;
            }
        }

        Object.keys(handlers).map((name) => {
            originals[name] = global[name];
            global[name] = (fn) => {
                if (innerDescribe) {
                    return originals[name](fn);
                } else {
                    return handlers[name].push(fn);
                }
            };
        });

        fn.apply(this, args);

        global.describe = originalDescribe;

        // restore and register actual handler
        Object.keys(handlers).map((name) => {
            global[name] = originals[name];
            global[name](async () => {
                for (const handler of handlers[name]) {
                    await handler();
                }
            });
        });
    }
}
