import { startServer, stopServer, isReady } from "../support/start-server";
import webdriver, { By, until } from "selenium-webdriver";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describe("auth/login", () => {
    let host, driver;

    beforeAll(async () => {
        host = await startServer("metabase");
        driver = new webdriver.Builder()
            .forBrowser('chrome')
            .build();
        await driver.navigate().to(`${host}/`);
    });

    it("should start", async () => {
        expect(await isReady(host)).toEqual(true);
    });

    it("should take you to the login page", async () => {
        driver.wait(until.elementLocated(By.css("[name=email]")));
        expect(await driver.isElementPresent(By.css("[name=email]"))).toEqual(true);
    });

    afterAll(async () => {
        driver.quit();
        await stopServer("metabase");
    });
});
