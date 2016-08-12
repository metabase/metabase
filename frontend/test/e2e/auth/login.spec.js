import { startServer, isReady } from "../support/start-server";
import webdriver, { By, until } from "selenium-webdriver";
import fs from "fs-promise";
import path from "path";

import { delay } from '../../../src/metabase/lib/promise';

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

const SAUCE_USERNAME = process.env["SAUCE_USERNAME"];
const SAUCE_ACCESS_KEY = process.env["SAUCE_ACCESS_KEY"];

async function loginMetabase(driver, username, password) {
    await driver.wait(until.elementLocated(By.css("[name=email]")));
    await driver.findElement(By.css("[name=email]")).sendKeys(username);
    await driver.findElement(By.css("[name=password]")).sendKeys(password);
    await driver.manage().timeouts().implicitlyWait(1000);
    await driver.findElement(By.css(".Button.Button--primary")).click();
}

function waitForUrl(driver, url, timeout = 5000) {
    return driver.wait(async () => await driver.getCurrentUrl() === url, timeout);
}

async function screenshot(driver, filename) {
    let dir = path.dirname(filename);
    if (dir && !(await fs.exists(dir))){
        await fs.mkdir(dir);
    }

    let image = await driver.takeScreenshot();
    await fs.writeFile(filename, image, 'base64');
}

import sauceConnectLauncher from "sauce-connect-launcher";

function startSauceConnect(config) {
    return new Promise((resolve, reject) => {
        sauceConnectLauncher(config, function (err, sauceConnectProcess) {
            if (err) {
                reject(err);
            } else {
                resolve({
                    close: () =>
                        new Promise((resolve, reject) =>
                            sauceConnectProcess.close(resolve)
                        )
                });
            }
        });
    });
}

describe("auth/login", () => {
    let server, sauceConnect, driver;

    beforeAll(async () => {
        [server, sauceConnect] = await Promise.all([
            startServer("frontend/test/e2e/support/fixtures/setup.db"),
            startSauceConnect({
                username: SAUCE_USERNAME,
                accessKey: SAUCE_ACCESS_KEY
            })
        ]);

        // driver = new webdriver.Builder()
        //     .forBrowser('chrome')
        //     .build();
        driver = new webdriver.Builder()
            .withCapabilities({
                'browserName': 'chrome',
                'platform': 'Mac',
                'version': '48.0',
                'username': SAUCE_USERNAME,
                'accessKey': SAUCE_ACCESS_KEY
            })
            .usingServer("http://" + SAUCE_USERNAME + ":" + SAUCE_ACCESS_KEY + "@localhost:4445/wd/hub")
            .build();
        });

    it ("should start", async () => {
        expect(await isReady(server.host)).toEqual(true);
    });

    describe("has no cookie", () => {
        beforeEach(async () => {
            await driver.get(`${server.host}/`);
            await driver.manage().deleteAllCookies();
        });

        it ("should take you to the login page", async () => {
            await driver.get(`${server.host}/`);
            await waitForUrl(driver, `${server.host}/auth/login?redirect=%2F`);
            expect(await driver.isElementPresent(By.css("[name=email]"))).toEqual(true);
            await screenshot(driver, "screenshots/auth-login.png");
        });

        it ("should log you in", async () => {
            await driver.get(`${server.host}/`);
            await loginMetabase(driver, "bob@metabase.com", "12341234");
            await waitForUrl(driver, `${server.host}/`);
        });

        xit ("should redirect you after logging in", async () => {
            await driver.get(`${server.host}/questions`);
            await waitForUrl(driver, `${server.host}/auth/login?redirect=%2Fquestions`);
            await loginMetabase(driver, "bob@metabase.com", "12341234");
            await waitForUrl(driver, `${server.host}/questions`);
        });
    });

    describe("valid session cookie", () => {
        beforeEach(async () => {
            await driver.get(`${server.host}/`);
            await driver.manage().addCookie("metabase.SESSION_ID", "d65a297d-860b-46b6-a2dd-8f98d37fb2cd");
        });

        it ("is logged in", async () => {
            await driver.get(`${server.host}/`);
            await waitForUrl(driver, `${server.host}/`);
            await screenshot(driver, "screenshots/loggedin.png");
        });

        it ("loads the qb", async () => {
            await driver.get(`${server.host}/q#eyJuYW1lIjpudWxsLCJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjoxLCJ0eXBlIjoibmF0aXZlIiwibmF0aXZlIjp7InF1ZXJ5Ijoic2VsZWN0ICdvaCBoYWkgZ3Vpc2Ug8J-QsScifSwicGFyYW1ldGVycyI6W119LCJkaXNwbGF5Ijoic2NhbGFyIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e319`);
            await screenshot(driver, "screenshots/qb.png");
        });
    });

    afterAll(async () => {
        await Promise.all([
            server.stop(),
            driver.quit(),
            sauceConnect.close()
        ]);
    });
});
