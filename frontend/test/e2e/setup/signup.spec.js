import path from "path";

import { isReady } from "../support/start-server";
import { setup, cleanup } from "../support/setup";
import { By, until } from "selenium-webdriver";

import {
    waitForElement,
    waitForElementRemoved,
    findElement,
    waitForElementAndClick,
    waitForElementAndSendKeys,
    waitForUrl,
    screenshot
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describe("setup/signup", () => {
    let server, sauceConnect, driver;

    beforeAll(async () => {
        //TODO: think about aggregating every test suite into a bigger container suite
        // and only do initialize/cleanup once? plus we can also save on browser restart times.
        // an alternative optimization would be to try to run multiple test suites in parallel
        ({ server, sauceConnect, driver } = await setup({dbKey: ''}));
    });

    it ("should start", async () => {
        expect(await isReady(server.host)).toEqual(true);
    });

    describe("onboarding", () => {
        it("should take you to the welcome page", async () => {
            await driver.get(`${server.host}/`);
            await waitForUrl(driver, `${server.host}/setup`);
            const welcomeText = await findElement(driver, "h1.text-brand")
                .getText();

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
            await waitForElementAndSendKeys(driver, "[name=firstName]", '1234');
            await waitForElementAndSendKeys(driver, "[name=lastName]", '1234');
            await waitForElementAndSendKeys(driver, "[name=email]", '1234@1234.com');
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
            expect(await onboardingModalHeading.getText()).toBe('1234, welcome to Metabase!');
            await screenshot(driver, "screenshots/setup-tutorial-main.png");
        });

        it("should guide users through query builder tutorial", async () => {
            await driver.get(`${server.host}/?new`);
            await waitForUrl(driver, `${server.host}/?new`);

            await waitForElementAndClick(driver, ".Modal .Button.Button--primary");
            await waitForElementAndClick(driver, ".Modal .Button.Button--primary");
            await waitForElementAndClick(driver, ".Modal .Button.Button--primary");

            await waitForUrl(driver, `${server.host}/q`);
            await waitForElement(driver, ".Modal .Button.Button--primary");
            await screenshot(driver, "screenshots/setup-tutorial-qb.png");
            await waitForElementAndClick(driver, ".Modal .Button.Button--primary");

            await waitForElement(driver, "img[src='/app/img/qb_tutorial/table.png']");
            // a .Modal-backdrop element blocks clicks for a while during transition?
            await waitForElementRemoved(driver, '.Modal-backdrop');
            await waitForElementAndClick(driver, ".GuiBuilder-data a");

            // select sample dataset db
            await waitForElementAndClick(driver, "#DatabaseSchemaPicker .List-section:last-child .List-section-header");

            // select orders table
            await waitForElementAndClick(driver, "#TablePicker .List-item:first-child>a");

            // select filters
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/funnel.png']");
            await waitForElementAndClick(driver, ".GuiBuilder-filtered-by .Query-section:not(.disabled) a");

            await waitForElementAndClick(driver, "#FilterPopover .List-item:first-child>a");

            await waitForElementAndClick(driver, ".Button[data-ui-tag='relative-date-shortcut-this-year']");
            await waitForElementAndClick(driver, ".Button[data-ui-tag='add-filter']:not(.disabled)");

            // select aggregations
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/calculator.png']");
            await waitForElementAndClick(driver, "#Query-section-aggregation");
            await waitForElementAndClick(driver, "#AggregationPopover .List-item:nth-child(2)>a");

            // select breakouts
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/banana.png']");
            await waitForElementAndClick(driver, ".Query-section.Query-section-breakout>div");

            await waitForElementAndClick(driver, "#BreakoutPopover .List-item:first-child .Field-extra>a");
            await waitForElementAndClick(driver, "#TimeGroupingPopover .List-item:nth-child(3)>a");

            // run query
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/rocket.png']");
            await waitForElementAndClick(driver, ".Button.RunButton");

            // wait for query to complete
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/chart.png']", 20000);

            // switch visualization
            await waitForElementAndClick(driver, "#VisualizationTrigger");
            // this step occassionally fails without the timeout
            await driver.sleep(500);
            await waitForElementAndClick(driver, "#VisualizationPopover li:nth-child(3)");

            // end tutorial
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/boat.png']");
            await waitForElementAndClick(driver, ".Modal .Button.Button--primary");
            await waitForElementAndClick(driver, ".PopoverBody .Button.Button--primary");

            await screenshot(driver, "screenshots/setup-tutorial-qb-end.png");
        });
    });

    afterAll(async () => {
        await cleanup({ server, sauceConnect, driver });
    });
});
