import fs from "fs-promise";
import path from "path";

import { By, until } from "selenium-webdriver";

export const waitForElement = async (driver, selector) =>
    await driver.wait(until.elementLocated(By.css(selector)));

export const findElement = (driver, selector) =>
    driver.findElement(By.css(selector));

export const clickElement = async (driver, selector) =>
    await findElement(driver, selector).click();

// waits for element to appear before clicking to avoid clicking too early
// prefer this over calling click() on element directly
export const waitForAndClickElement = async (driver, selector) => {
    await waitForElement(driver, selector);
    return await clickElement(driver, selector);
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
