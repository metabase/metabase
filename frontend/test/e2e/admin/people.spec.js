import path from "path";

import { isReady } from "../support/start-server";
import { setup, cleanup } from "../support/setup";
import { By, until } from "selenium-webdriver";

import {
    waitForElement,
    waitForElementText,
    waitForElementRemoved,
    findElement,
    waitForElementAndClick,
    waitForElementAndSendKeys,
    waitForUrl,
    screenshot,
    loginMetabase
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describe("admin/people", () => {
    let server, sauceConnect, driver;

    beforeAll(async () => {
        ({ server, sauceConnect, driver } = await setup({
            name: "admin/people",
        }));
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
            await waitForElementAndClick(driver, ".Button.Button--primary");

            // fill in user info form
            const addButton = findElement(driver, ".Modal .Button[disabled]");
            await waitForElementAndSendKeys(driver, "[name=firstName]", '1234');
            await waitForElementAndSendKeys(driver, "[name=lastName]", '1234');
            await waitForElementAndSendKeys(driver, "[name=email]", '1234@1234.com');
            expect(await addButton.isEnabled()).toBe(true);
            await addButton.click();

            // get password
            await waitForElementAndClick(driver, ".Modal a.link");
            const passwordInput = await waitForElement(driver, ".Modal input");
            const password = await passwordInput.getAttribute("value");
            await waitForElementAndClick(driver, ".Modal .Button.Button--primary");

            // change user role
            await waitForElementAndClick(driver, ".ContentTable tr:first-child .AdminSelectBorderless.text-brand");
            await waitForElementAndClick(driver, ".UserRolePopover li:last-child>a");
            expect(await driver.isElementPresent(By.css("tr:first-child .AdminSelectBorderless.text-purple"))).toEqual(true);

            // edit user details
            await waitForElementAndClick(driver, ".ContentTable tr:first-child td:last-child a");
            await waitForElementAndClick(driver, ".UserActionsSelect li:first-child");

            const saveButton = findElement(driver, ".Modal .Button[disabled]");
            await waitForElementAndSendKeys(driver, "[name=firstName]", '12345');
            await waitForElementAndSendKeys(driver, "[name=lastName]", '123456');
            await waitForElementAndSendKeys(driver, "[name=email]", '12345@1234.com');
            expect(await saveButton.isEnabled()).toBe(true);
            await saveButton.click();

            expect(await waitForElementText(driver, ".ContentTable tr:first-child td:first-child span:last-child", "12345 123456")).toEqual("12345 123456");
            expect(await waitForElementText(driver, ".ContentTable tr:first-child td:nth-child(3)", "12345@1234.com")).toEqual("12345@1234.com");

            // reset user password
            await waitForElementAndClick(driver, ".ContentTable tr:first-child td:last-child a");
            await waitForElementAndClick(driver, ".UserActionsSelect li:nth-child(2)");

            await waitForElementAndClick(driver, ".Modal .Button.Button--warning");
            await waitForElementAndClick(driver, ".Modal a.link");

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
