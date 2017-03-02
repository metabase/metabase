import {
    waitForElement,
    waitForElementText,
    findElement,
    waitForElementAndClick,
    waitForElementAndSendKeys,
    waitForElementRemoved,
    waitForUrl,
    screenshot,
    loginMetabase,
    describeE2E
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describeE2E("admin/people", () => {
    describe("user management", () => {
        it("should allow admin to create new users", async () => {
            const email = "testy" + Math.round(Math.random()*10000) + "@metabase.com";
            const firstName = "Testy";
            const lastName = "McTestFace";

            await driver.get(`${server.host}/`);
            await loginMetabase(driver, "bob@metabase.com", "12341234");
            await waitForUrl(driver, `${server.host}/`);

            await driver.get(`${server.host}/admin/people`);

            await screenshot(driver, "screenshots/admin-people.png");

            // click add person button
            await waitForElementAndClick(driver, ".Button.Button--primary");

            // fill in user info form
            const addButton = findElement(driver, ".ModalContent .Button[disabled]");
            await waitForElementAndSendKeys(driver, "[name=firstName]", firstName);
            await waitForElementAndSendKeys(driver, "[name=lastName]", lastName);
            await waitForElementAndSendKeys(driver, "[name=email]", email);
            expect(await addButton.isEnabled()).toBe(true);
            await addButton.click();

            // get password
            await waitForElementAndClick(driver, ".Modal a.link");
            const password = await waitForElement(driver, ".Modal input").getAttribute("value");
            await waitForElementAndClick(driver, ".Modal .Button.Button--primary");

            await waitForElementText(driver, ".ContentTable tr:first-child td:first-child span:last-child", `${firstName} ${lastName}`);
            await waitForElementText(driver, ".ContentTable tr:first-child td:nth-child(3)", email);

            // add admin permissions
            await waitForElementText(driver, ".ContentTable tr:first-child .AdminSelectBorderless", "Default");
            await waitForElementAndClick(driver, ".ContentTable tr:first-child .AdminSelectBorderless");
            await waitForElementAndClick(driver, ".GroupSelect .GroupOption:first-child");
            await waitForElementText(driver, ".ContentTable tr:first-child .AdminSelectBorderless", "Admin");

            // edit user details
            await waitForElementAndClick(driver, ".ContentTable tr:first-child td:last-child a");
            await waitForElementAndClick(driver, ".UserActionsSelect li:first-child");

            const saveButton = findElement(driver, ".ModalContent .Button[disabled]");
            await waitForElementAndSendKeys(driver, "[name=firstName]", `${firstName}x`);
            await waitForElementAndSendKeys(driver, "[name=lastName]", `${lastName}x`);
            await waitForElementAndSendKeys(driver, "[name=email]", `${email}x`);
            expect(await saveButton.isEnabled()).toBe(true);
            await saveButton.click();

            await waitForElementText(driver, ".ContentTable tr:first-child td:first-child span:last-child", `${firstName}x ${lastName}x`);
            await waitForElementText(driver, ".ContentTable tr:first-child td:nth-child(3)", `${email}x`);

            // reset user password
            await waitForElementRemoved(driver, ".Modal");
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
});
