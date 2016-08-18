import fs from "fs-promise";
import path from "path";

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
