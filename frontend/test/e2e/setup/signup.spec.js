import path from "path";

import {
    waitForElement,
    findElement,
    waitForElementAndClick,
    waitForElementAndSendKeys,
    waitForUrl,
    screenshot,
    describeE2E
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describeE2E("setup/signup", { dbKey: "" }, () => {
    describe("onboarding", () => {
        it("should take you to the welcome page", async () => {
            await driver.get(`${server.host}/`);
            await waitForUrl(driver, `${server.host}/setup`);
            const welcomeText = await findElement(driver, "h1.text-brand").getText();

            expect(welcomeText).toEqual('Welcome to Metabase');
            await screenshot(driver, "screenshots/setup-welcome.png");
        });

        it("should allow you to sign up and add db", async () => {
            await driver.get(`${server.host}/`);
            await waitForUrl(driver, `${server.host}/setup`);
            await waitForElementAndClick(driver, ".Button.Button--primary");

            // fill in sign up form
            await waitForElement(driver, "[name=firstName]");
            await screenshot(driver, "screenshots/setup-signup-user.png");

            const nextButton = findElement(driver, ".Button[disabled]");
            await waitForElementAndSendKeys(driver, "[name=firstName]", 'Testy');
            await waitForElementAndSendKeys(driver, "[name=lastName]", 'McTestface');
            await waitForElementAndSendKeys(driver, "[name=email]", 'testy@metabase.com');
            await waitForElementAndSendKeys(driver, "[name=password]", '12341234');
            await waitForElementAndSendKeys(driver, "[name=passwordConfirm]", '12341234');
            await waitForElementAndSendKeys(driver, "[name=siteName]", '1234');
            expect(await nextButton.isEnabled()).toBe(true);
            await nextButton.click();

            // add h2 database
            await waitForElement(driver, "option[value=h2]");
            await screenshot(driver, "screenshots/setup-signup-db.png");

            const h2Option = findElement(driver, "option[value=h2]");
            await h2Option.click();
            await waitForElementAndSendKeys(driver, "[name=name]", 'Metabase H2');
            const dbPath = path.resolve(__dirname, '../support/fixtures/metabase.db');
            await waitForElementAndSendKeys(driver, "[name=db]", `file:${dbPath}`);
            await waitForElementAndClick(driver, ".Button.Button--primary");

            await waitForElement(driver, ".SetupStep.rounded.full.relative.SetupStep--active:last-of-type");
            await waitForElementAndClick(driver, ".Button.Button--primary");

            await waitForElement(driver, "a[href='/?new']");
            await screenshot(driver, "screenshots/setup-signup-complete.png");
            await waitForElementAndClick(driver, ".Button.Button--primary");

            await waitForUrl(driver, `${server.host}/?new`);
            await waitForElement(driver, ".Modal h2:first-child");
            const onboardingModalHeading = await findElement(driver, ".Modal h2:first-child");
            expect(await onboardingModalHeading.getText()).toBe('Testy, welcome to Metabase!');
            await screenshot(driver, "screenshots/setup-tutorial-main.png");
        });
    });
});
