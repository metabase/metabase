import path from "path";

import { isReady } from "../support/start-server";
import { setup, cleanup } from "../support/setup";
import { By, until } from "selenium-webdriver";

import {
    waitForElement,
    waitForElementText,
    waitForElementRemoved,
    findElement,
    waitForAndClickElement,
    waitForUrl,
    screenshot,
    loginMetabase
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describe("admin/people", () => {
    let server, sauceConnect, driver;

    beforeAll(async () => {
        ({ server, sauceConnect, driver } = await setup());
    });

    it ("should start", async () => {
        expect(await isReady(server.host)).toEqual(true);
    });

    describe("user management", () => {
        it("should allow admin to create new users", async () => {
            await driver.get(`${server.host}/`);
            await loginMetabase(driver, "bob@metabase.com", "12341234");
            await waitForUrl(driver, `${server.host}/`);

            await driver.get(`${server.host}/admin/people`);

            await screenshot(driver, "screenshots/admin-people.png");

            // click add person button
            await waitForAndClickElement(driver, ".Button.Button--primary");

            // fill in user info form
            const addButton = findElement(driver, ".Modal .Button[disabled]");
            await findElement(driver, "[name=firstName]").sendKeys('1234');
            await findElement(driver, "[name=lastName]").sendKeys('1234');
            await findElement(driver, "[name=email]").sendKeys('1234@1234.com');
            expect(await addButton.isEnabled()).toBe(true);
            await addButton.click();

            // get password
            await waitForAndClickElement(driver, ".Modal a.link");
            const passwordInput = await waitForElement(driver, ".Modal input");
            const password = await passwordInput.getAttribute("value");
            await waitForAndClickElement(driver, ".Modal .Button.Button--primary");

            // change user role
            await waitForAndClickElement(driver, ".ContentTable tr:first-child .AdminSelectBorderless.text-brand");
            await waitForAndClickElement(driver, ".UserRolePopover li:last-child>a");
            expect(await driver.isElementPresent(By.css("tr:first-child .AdminSelectBorderless.text-purple"))).toEqual(true);

            // edit user details
            await waitForAndClickElement(driver, ".ContentTable tr:first-child td:last-child a");
            await waitForAndClickElement(driver, ".UserActionsSelect li:first-child");

            const saveButton = findElement(driver, ".Modal .Button[disabled]");
            await findElement(driver, "[name=firstName]").clear();
            await findElement(driver, "[name=firstName]").sendKeys('12345');
            await findElement(driver, "[name=lastName]").clear();
            await findElement(driver, "[name=lastName]").sendKeys('123456');
            await findElement(driver, "[name=email]").clear();
            await findElement(driver, "[name=email]").sendKeys('12345@1234.com');
            expect(await saveButton.isEnabled()).toBe(true);
            await saveButton.click();

            expect(await waitForElementText(driver, ".ContentTable tr:first-child td:first-child span:last-child")).toEqual("12345 123456");
            expect(await waitForElementText(driver, ".ContentTable tr:first-child td:nth-child(3)")).toEqual("12345@1234.com");

            // reset user password
            await waitForAndClickElement(driver, ".ContentTable tr:first-child td:last-child a");
            await waitForAndClickElement(driver, ".UserActionsSelect li:nth-child(2)");

            await waitForAndClickElement(driver, ".Modal .Button.Button--warning");
            await waitForAndClickElement(driver, ".Modal a.link");
            const newPasswordInput = await waitForElement(driver, ".Modal input");
            const newPassword = await newPasswordInput.getAttribute("value");

            expect(newPassword).not.toEqual(password);

            //TODO: verify new user can sign in?
        });
    });

    afterAll(async () => {
        await cleanup({ server, sauceConnect, driver });
    });
});
