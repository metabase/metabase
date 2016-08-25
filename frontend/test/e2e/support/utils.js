import fs from "fs-promise";
import path from "path";

import { By, until } from "selenium-webdriver";

const DEFAULT_TIMEOUT = 5000;

const delay = (timeout = 0) => new Promise((resolve) => setTimeout(resolve, timeout));

export const findElement = (driver, selector) =>
    // consider looking into a better test reporter
    // default jasmine reporter leaves much to be desired
    console.log(`\nlooking for element: ${selector}`) ||
    driver.findElement(By.css(selector));

export const waitForElement = async (driver, selector, timeout = DEFAULT_TIMEOUT) =>
    console.log(`\nwaiting for element: ${selector}`) ||
    await driver.wait(until.elementLocated(By.css(selector)), timeout);

export const waitForElementRemoved = async (driver, selector, timeout = DEFAULT_TIMEOUT) => {
    console.log(`\nwaiting for element to be removed: ${selector}`);
    try {
        const element = findElement(driver, selector);
        await driver.wait(until.stalenessOf(element), timeout);
    }
    catch (error) {
        return;
    }
};

export const waitForElementText = async (driver, selector, text, timeout = DEFAULT_TIMEOUT) => {
    console.log(`\nwaiting for element text${text ? ` to equal ${text}` : ''}: ${selector}`);
    const element = await waitForElement(driver, selector, timeout);
    const elementText = await element.getText();

    if (!text || text === elementText) {
        return elementText;
    }

    await driver.wait(until.elementTextIs(element, text), timeout);
    return text;
};

export const clickElement = async (driver, selector) =>
    console.log(`\nclicking on element: ${selector}`) ||
    await findElement(driver, selector).click();

// waits for element to appear before clicking to avoid clicking too early
// prefer this over calling click() on element directly
export const waitForElementAndClick = async (driver, selector, timeout = DEFAULT_TIMEOUT) => {
    console.log(`\nwaiting for element to click: ${selector}`);
    const element = await waitForElement(driver, selector, timeout);
    // webdriver complains about stale element this way
    // await Promise.all(
    //     driver.wait(until.elementIsVisible(element)),
    //     driver.wait(until.elementIsEnabled(element))
    // );
    const element2 = await driver.wait(until.elementIsVisible(element), timeout);
    const element3 = await driver.wait(until.elementIsEnabled(element2), timeout);

    // queues click behind existing calls, might help with brittleness?
    await delay();
    return await element3.click();
};

export const waitForElementAndSendKeys = async (driver, selector, keys, timeout = DEFAULT_TIMEOUT) => {
    console.log(`\nwaiting for element to send ${keys}: ${selector}`);
    const element = await waitForElement(driver, selector, timeout);
    await element.clear();
    return await element.sendKeys(keys);
};

export const waitForUrl = (driver, url, timeout = DEFAULT_TIMEOUT) => {
    console.log(`\nwaiting for url: ${url}`);
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
    console.log(`\ntaking screenshot: ${filename}`);
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

export const loginMetabase = async (driver, username, password) => {
    await driver.wait(until.elementLocated(By.css("[name=email]")));
    await driver.findElement(By.css("[name=email]")).sendKeys(username);
    await driver.findElement(By.css("[name=password]")).sendKeys(password);
    await driver.manage().timeouts().implicitlyWait(1000);
    await driver.findElement(By.css(".Button.Button--primary")).click();
};
