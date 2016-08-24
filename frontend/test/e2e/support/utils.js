import fs from "fs-promise";
import path from "path";

import { By, until } from "selenium-webdriver";

const DEFAULT_TIMEOUT = 5000;

export const findElement = (driver, selector) =>
    driver.findElement(By.css(selector));

export const waitForElement = async (driver, selector, timeout = DEFAULT_TIMEOUT) =>
    await driver.wait(until.elementLocated(By.css(selector)), timeout);

export const waitForElementRemoved = async (driver, selector, timeout = DEFAULT_TIMEOUT) => {
    if (!(await driver.isElementPresent(By.css(selector)))) {
        return;
    }
    const element = findElement(driver, selector);
    await driver.wait(until.stalenessOf(element), timeout);
};

export const waitForElementText = async (driver, selector, text, timeout = DEFAULT_TIMEOUT) => {
    const element = await waitForElement(driver, selector, timeout);
    const elementText = await element.getText();

    if (!text || text === elementText) {
        return elementText;
    }

    await driver.wait(until.elementTextIs(element, text), timeout);
    return text;
};

export const clickElement = async (driver, selector) =>
    await findElement(driver, selector).click();

// waits for element to appear before clicking to avoid clicking too early
// prefer this over calling click() on element directly
export const waitForAndClickElement = async (driver, selector, timeout = DEFAULT_TIMEOUT) => {
    const element = await waitForElement(driver, selector, timeout);
    // webdriver complains about stale element this way
    // await Promise.all(
    //     driver.wait(until.elementIsVisible(element)),
    //     driver.wait(until.elementIsEnabled(element))
    // );
    const element2 = await driver.wait(until.elementIsVisible(element), timeout);
    const element3 = await driver.wait(until.elementIsEnabled(element2), timeout);
    return await element.click();
};

export const waitForUrl = (driver, url, timeout = DEFAULT_TIMEOUT) => {
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
