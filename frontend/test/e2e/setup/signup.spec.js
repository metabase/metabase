import path from "path";

import { isReady } from "../support/start-server";
import { setup, cleanup } from "../support/setup";
import { By, until } from "selenium-webdriver";

import {
    waitForElement,
    findElement,
    waitForAndClickElement,
    waitForUrl,
    screenshot
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describe("setup/signup", () => {
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
            const welcomeText = await findElement(driver, "h1.text-brand")
                .getText();

            expect(welcomeText).toEqual('Welcome to Metabase');
            await screenshot(driver, "screenshots/setup-welcome.png");
        });

        it("should allow you to sign up and add db", async () => {
            await driver.get(`${server.host}/`);
            await waitForUrl(driver, `${server.host}/setup`);
            await waitForAndClickElement(driver, ".Button.Button--primary");

            // fill in sign up form
            await waitForElement(driver, "[name=firstName]");
            await screenshot(driver, "screenshots/setup-signup-user.png");

            const nextButton = findElement(driver, ".Button[disabled]");
            await findElement(driver, "[name=firstName]").sendKeys('1234');
            await findElement(driver, "[name=lastName]").sendKeys('1234');
            await findElement(driver, "[name=email]").sendKeys('1234@1234.com');
            await findElement(driver, "[name=password]").sendKeys('12341234');
            await findElement(driver, "[name=passwordConfirm]").sendKeys('12341234');
            await findElement(driver, "[name=siteName]").sendKeys('1234');
            expect(await nextButton.isEnabled()).toBe(true);
            await nextButton.click();

            // add h2 database
            await waitForElement(driver, "option[value=h2]");
            await screenshot(driver, "screenshots/setup-signup-db.png");

            const h2Option = findElement(driver, "option[value=h2]");
            await h2Option.click();
            await findElement(driver, "[name=name]").sendKeys('Metabase H2');
            const dbPath = path.resolve(__dirname, '../support/fixtures/metabase.db');
            await findElement(driver, "[name=db]").sendKeys(`file:${dbPath}`);
            await waitForAndClickElement(driver, ".Button.Button--primary");

            await waitForElement(driver, ".SetupStep.rounded.full.relative.SetupStep--active:last-of-type");
            await waitForAndClickElement(driver, ".Button.Button--primary");

            await waitForElement(driver, "a[href='/?new']");
            await screenshot(driver, "screenshots/setup-signup-complete.png");
            await waitForAndClickElement(driver, ".Button.Button--primary");

            await waitForUrl(driver, `${server.host}/?new`);
            await waitForElement(driver, ".Modal h2:first-child");
            const onboardingModalHeading = await findElement(driver, ".Modal h2:first-child");
            expect(await onboardingModalHeading.getText()).toBe('1234, welcome to Metabase!');
            await screenshot(driver, "screenshots/setup-tutorial-main.png");
        });

        it("should guide users through query builder tutorial", async () => {
            await driver.get(`${server.host}/?new`);
            await waitForUrl(driver, `${server.host}/?new`);

            await waitForAndClickElement(driver, ".Modal .Button.Button--primary");
            await waitForAndClickElement(driver, ".Modal .Button.Button--primary");
            await waitForAndClickElement(driver, ".Modal .Button.Button--primary");

            await waitForUrl(driver, `${server.host}/q`);
            await screenshot(driver, "screenshots/setup-tutorial-qb.png");
            await waitForAndClickElement(driver, ".Modal .Button.Button--primary");

            await waitForElement(driver, "img[src='/app/img/qb_tutorial/table.png']");
            // a .Modal-backdrop element blocks clicks for a while during transition?
            await driver.wait(async () => (await driver.findElements(By.css('.Modal-backdrop'))).length === 0);
            await waitForAndClickElement(driver, ".GuiBuilder-data a");

            // select sample dataset db
            await waitForAndClickElement(driver, "#DatabaseSchemaPicker .List-section:last-child .List-section-header");

            // select orders table
            await waitForAndClickElement(driver, "#TablePicker .List-item:first-child>a");

            // select filters
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/funnel.png']");
            await waitForAndClickElement(driver, ".GuiBuilder-filtered-by .Query-section:not(.disabled) a");

            await waitForAndClickElement(driver, "#FilterPopover .List-item:first-child>a");

            await waitForAndClickElement(driver, ".Button[data-ui-tag='relative-date-shortcut-this-year']");
            await waitForAndClickElement(driver, ".Button[data-ui-tag='add-filter']:not(.disabled)");

            // select aggregations
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/calculator.png']");
            await waitForAndClickElement(driver, "#Query-section-aggregation");
            await waitForAndClickElement(driver, "#AggregationPopover .List-item:nth-child(2)>a");

            // select breakouts
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/banana.png']");
            await waitForAndClickElement(driver, ".Query-section.Query-section-breakout>div");

            await waitForAndClickElement(driver, "#BreakoutPopover .List-item:first-child .Field-extra>a");
            await waitForAndClickElement(driver, "#TimeGroupingPopover .List-item:nth-child(3)>a");

            // run query
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/rocket.png']");
            await waitForAndClickElement(driver, ".Button.RunButton");

            await waitForElement(driver, "img[src='/app/img/qb_tutorial/chart.png']");
            await waitForAndClickElement(driver, ".VisualizationSettings>div>a");
            await waitForAndClickElement(driver, "#VisualizationPopover li:nth-child(3)");

            // end tutorial
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/boat.png']");
            await waitForAndClickElement(driver, ".Modal .Button.Button--primary");
            await waitForAndClickElement(driver, ".PopoverBody .Button.Button--primary");

            await screenshot(driver, "screenshots/setup-tutorial-qb-end.png");
        });
    });

    afterAll(async () => {
        await cleanup({ server, sauceConnect, driver });
    });
});
