import { isReady } from "../support/start-server";
import { setup, cleanup } from "../support/setup";
import { By, until } from "selenium-webdriver";

import {
    waitForUrl,
    screenshot,
    loginMetabase
} from "../support/utils";

import { delay } from '../../../src/metabase/lib/promise';

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describe("auth/login", () => {
    let server, sauceConnect, driver;

    beforeAll(async () => {
        ({ server, sauceConnect, driver } = await setup());
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
        await cleanup({ server, sauceConnect, driver });
    });
});
