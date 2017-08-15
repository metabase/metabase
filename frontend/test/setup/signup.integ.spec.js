import {
    createTestStore,
    switchToPlainDatabase,
    BROWSER_HISTORY_REPLACE
} from "__support__/integrated_tests";
import {
    click,
    clickButton,
    setInputValue
} from "__support__/enzyme_utils";

import { mount } from "enzyme";
import { delay } from "metabase/lib/promise"
import Setup from "metabase/setup/components/Setup";
import { SET_ACTIVE_STEP } from "metabase/setup/actions";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
describe("setup wizard", () => {
    let store = null;
    let app = null;

    beforeAll(async () => {
        switchToPlainDatabase();
        store = await createTestStore()
        store.pushPath("/");
        app = mount(store.getAppContainer())
    })

    it("should start from the welcome page", async () => {
        await store.waitForActions([BROWSER_HISTORY_REPLACE])
        expect(store.getPath()).toBe("/setup")
        expect(app.find(Setup).find("h1").text()).toBe("Welcome to Metabase")
    });

    it("should allow you to create an account", async () => {
        clickButton(app.find(".Button.Button--primary"))
        await store.waitForActions([SET_ACTIVE_STEP])

        const nextButton = app.find('button[children="Next"]')
        expect(nextButton.props().disabled).toBe(true)

        setInputValue(app.find('input[name="firstName"]'), 'Testy')
        setInputValue(app.find('input[name="lastName"]'), 'McTestface')
        setInputValue(app.find('input[name="email"]'), 'testy@metabase.com')
        // test first with a weak password
        setInputValue(app.find('input[name="password"]'), '12341234')
        setInputValue(app.find('input[name="passwordConfirm"]'), '12341234')
        setInputValue(app.find('input[name="siteName"]'), '1234')

        // the form shouldn't be valid yet
        expect(nextButton.props().disabled).toBe(true)

        // then with a strong password, generated with my beloved password manager
        setInputValue(app.find('input[name="password"]'), 'QJbHYJN3tPW[29AoBM3#rsfB4@hshp>gC8mDmUTtbGTfExY]#nBjmtX@NmEJwxBc')
        setInputValue(app.find('input[name="passwordConfirm"]'), 'QJbHYJN3tPW[29AoBM3#rsfB4@hshp>gC8mDmUTtbGTfExY]#nBjmtX@NmEJwxBc')

        // THIS FAILS! That's because UserStep has some React anti-patterns.
        expect(nextButton.props().disabled).toBe(false)
        clickButton(nextButton);
    })

    it("should allow you to add a database", async () => {
        // // add h2 database
        // await waitForElement(driver, "option[value=h2]");
        //
        // const h2Option = findElement(driver, "option[value=h2]");
        // await h2Option.click();
        // await waitForElementAndSendKeys(driver, "[name=name]", 'Metabase H2');
        // const dbPath = path.resolve(__dirname, '../support/fixtures/metabase.db');
        // await waitForElementAndSendKeys(driver, "[name=db]", `file:${dbPath}`);
        // await waitForElementAndClick(driver, ".Button.Button--primary");
    })

    it("should let you opt in/out from user tracking", async () => {
        //
        // await waitForElement(driver, ".SetupStep.rounded.full.relative.SetupStep--active:last-of-type");
        // await waitForElementAndClick(driver, ".Button.Button--primary");
        //
        // await waitForElement(driver, "a[href='/?new']");
        // await waitForElementAndClick(driver, ".Button.Button--primary");
        //
        // await waitForUrl(driver, `${server.host}/?new`);
        // await waitForElement(driver, ".Modal h2:first-child");
        // const onboardingModalHeading = await findElement(driver, ".Modal h2:first-child");
        // expect(await onboardingModalHeading.getText()).toBe('Testy, welcome to Metabase!');
    })

    // NOTE Atte Keinänen 8/15/17:
    // If you want to develop tests incrementally, you should disable this step as this will complete the setup
    // That is an irreversible action (you have to nuke the db in order to see the setup screen again
    it("should show you the onboarding modal", async () => {

    })

    afterAll(async () => {
        // Problem with setup guide test is that you can't reset the db to the initial state
    })
});
