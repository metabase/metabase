import fs from "fs-promise";
import path from "path";

import { By, until } from "selenium-webdriver";

export const findElement = (driver, selector) =>
    driver.findElement(By.css(selector));

export const waitForElement = async (driver, selector, timeout = 5000) =>
    console.log('waiting ' + selector)||await driver.wait(until.elementLocated(By.css(selector)), timeout);

export const clickElement = async (driver, selector) =>
    console.log('clicking ' + selector)||await findElement(driver, selector).click();

// waits for element to appear before clicking to avoid clicking too early
// prefer this over calling click() on element directly
export const waitForAndClickElement = async (driver, selector, timeout = 5000) => {
    const element = await waitForElement(driver, selector, timeout);
    // webdriver complains about stale element this way
    // await Promise.all(
    //     driver.wait(until.elementIsVisible(element)),
    //     driver.wait(until.elementIsEnabled(element))
    // );
    const element2 = await driver.wait(until.elementIsVisible(element), timeout)
    const element3 = await driver.wait(until.elementIsEnabled(element2), timeout)
    console.log('clicking ' + selector);
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
