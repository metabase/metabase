import { isReady } from "../support/start-server";
import { setup, cleanup } from "../support/setup";
import { By, until } from "selenium-webdriver";

import { waitForUrl, screenshot } from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

const signupMetabase = async (driver) => {
    await driver.findElement(By.css(".Button.Button--primary")).click();
    await driver.wait(until.elementLocated(By.css("[name=firstName]")));
    const nextButton = driver.findElement(By.css(".Button[disabled]"));
    await driver.findElement(By.css("[name=firstName]")).sendKeys('1234');
    await driver.findElement(By.css("[name=lastName]")).sendKeys('1234');
    await driver.findElement(By.css("[name=email]")).sendKeys('1234@1234.com');
    await driver.findElement(By.css("[name=password]")).sendKeys('12341234');
    await driver.findElement(By.css("[name=passwordConfirm]")).sendKeys('12341234');
    await driver.findElement(By.css("[name=siteName]")).sendKeys('1234');
    expect(await nextButton.isEnabled()).toBe(true);
    await nextButton.click();
};

describe("setup/setup", () => {
    let server, sauceConnect, driver;

    beforeAll(async () => {
        ({ server, sauceConnect, driver } = await setup({ dbKey: "frontend/test/e2e/support/fixtures/init.db" }));
    });

    it ("should start", async () => {
        expect(await isReady(server.host)).toEqual(true);
    });

    describe("onboarding", () => {
        it("should take you to the welcome page", async () => {
            await driver.get(`${server.host}/`);
            await waitForUrl(driver, `${server.host}/setup`);
            const welcomeText = await driver.findElement(By.css("h1.text-brand"))
                .getText();

            expect(welcomeText).toEqual('Welcome to Metabase');
            await screenshot(driver, "screenshots/init-setup.png");
        });

        it("should allow you to sign up", async () => {
            await driver.get(`${server.host}/`);
            await waitForUrl(driver, `${server.host}/setup`);
            await signupMetabase(driver);
        });
    });

    afterAll(async () => {
        await cleanup({ server, sauceConnect, driver });
    });
});
