import fs from "fs-promise";
import path from "path";

import { By, until } from "selenium-webdriver";

export const findElement = (driver, selector) =>
    driver.findElement(By.css(selector));

export const waitForElement = async (driver, selector, timeout = 5000) =>
    await driver.wait(until.elementLocated(By.css(selector)), timeout);

export const waitForElementRemoved = async (driver, selector, timeout = 5000) => {
    try {
        const element = findElement(driver, selector);
        await driver.wait(until.stalenessOf(element), timeout);
    }
    catch(error) {
        // if element doesn't exist, consider it already removed and swallow error
    }
};

export const clickElement = async (driver, selector) =>
    await findElement(driver, selector).click();

// waits for element to appear before clicking to avoid clicking too early
// prefer this over calling click() on element directly
export const waitForAndClickElement = async (driver, selector, timeout = 5000) => {
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

export const waitForUrl = (driver, url, timeout = 5000) => {
    return driver.wait(async () => await driver.getCurrentUrl() === url, timeout);
};

export const screenshot = async (driver, filename) => {
    const dir = path.dirname(filename);
    if (dir && !(await fs.exists(dir))){
        await fs.mkdir(dir);
    }

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
