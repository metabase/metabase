import path from "path";

import { isReady } from "../support/start-server";
import { setup, cleanup } from "../support/setup";
import { By, until } from "selenium-webdriver";

import { waitForUrl, screenshot } from "../support/utils";

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
            const welcomeText = await driver.findElement(By.css("h1.text-brand"))
                .getText();

            expect(welcomeText).toEqual('Welcome to Metabase');
            await screenshot(driver, "screenshots/setup-welcome.png");
        });

        it("should allow you to sign up and add db", async () => {
            await driver.get(`${server.host}/`);
            await waitForUrl(driver, `${server.host}/setup`);
            await driver.findElement(By.css(".Button.Button--primary")).click();

            // fill in sign up form
            await driver.wait(until.elementLocated(By.css("[name=firstName]")));
            await screenshot(driver, "screenshots/setup-signup-user.png");

            const nextButton = driver.findElement(By.css(".Button[disabled]"));
            await driver.findElement(By.css("[name=firstName]")).sendKeys('1234');
            await driver.findElement(By.css("[name=lastName]")).sendKeys('1234');
            await driver.findElement(By.css("[name=email]")).sendKeys('1234@1234.com');
            await driver.findElement(By.css("[name=password]")).sendKeys('12341234');
            await driver.findElement(By.css("[name=passwordConfirm]")).sendKeys('12341234');
            await driver.findElement(By.css("[name=siteName]")).sendKeys('1234');
            expect(await nextButton.isEnabled()).toBe(true);
            await nextButton.click();

            // add h2 database
            await driver.wait(until.elementLocated(By.css("option[value=h2]")));
            await screenshot(driver, "screenshots/setup-signup-db.png");

            const h2Option = driver.findElement(By.css("option[value=h2]"));
            await h2Option.click();
            await driver.findElement(By.css("[name=name]")).sendKeys('Metabase H2');
            const dbPath = path.resolve(__dirname, '../support/fixtures/metabase.db');
            await driver.findElement(By.css("[name=db]")).sendKeys(`file:${dbPath}`);
            await driver.findElement(By.css(".Button.Button--primary")).click();

            await driver.wait(until.elementLocated(By.css(".SetupStep.rounded.full.relative.SetupStep--active:last-of-type")));
            await driver.findElement(By.css(".Button.Button--primary")).click();

            await driver.wait(until.elementLocated(By.css("a[href='/?new']")));
            await screenshot(driver, "screenshots/setup-signup-complete.png");
            await driver.findElement(By.css(".Button.Button--primary")).click();

            await waitForUrl(driver, `${server.host}/?new`);
            await driver.wait(until.elementLocated(By.css(".Modal h2:first-child")));
            const onboardingModalHeading = await driver.findElement(By.css(".Modal h2:first-child"));
            expect(await onboardingModalHeading.getText()).toBe('1234, welcome to Metabase!');
            await screenshot(driver, "screenshots/setup-tutorial-main.png");
        });

        it("should guide users through query builder tutorial", async () => {
            await driver.get(`${server.host}/?new`);
            await waitForUrl(driver, `${server.host}/?new`);
            await driver.wait(until.elementLocated(By.css(".Modal .Button.Button--primary")));

            await driver.findElement(By.css(".Modal .Button.Button--primary")).click();
            await driver.findElement(By.css(".Modal .Button.Button--primary")).click();
            await driver.findElement(By.css(".Modal .Button.Button--primary")).click();

            await waitForUrl(driver, `${server.host}/q`);
            await screenshot(driver, "screenshots/setup-tutorial-qb.png");
            await driver.findElement(By.css(".Modal .Button.Button--primary")).click();

            await driver.wait(until.elementLocated(By.css("img[src='/app/img/qb_tutorial/table.png']")));
            // a .Modal-backdrop element blocks clicks for a while during transition?
            await driver.wait(async () => (await driver.findElements(By.css('.Modal-backdrop'))).length === 0);
            await driver.findElement(By.css(".GuiBuilder-data a")).click();

            // select sample dataset db
            await driver.wait(until.elementLocated(By.css(".PopoverBody")));
            await driver.findElement(By.css(".PopoverBody .List-section:last-child")).click();

            // select orders table
            await driver.wait(until.elementLocated(By.css(".PopoverBody .List-item:first-child")));
            await driver.findElement(By.css(".PopoverBody .List-item:first-child")).click();

            // select filters
            await driver.wait(until.elementLocated(By.css("img[src='/app/img/qb_tutorial/funnel.png']")));
            await driver.wait(until.elementLocated(By.css(".GuiBuilder-filtered-by .Query-section:not(.disabled)")));
            await driver.findElement(By.css(".GuiBuilder-filtered-by a")).click();

            await driver.wait(until.elementLocated(By.css(".FilterPopover")));
            await driver.findElement(By.css(".PopoverBody .List-item:first-child")).click();

            await driver.wait(until.elementLocated(By.css(".Button[data-ui-tag='relative-date-shortcut-this-year']")));
            await driver.findElement(By.css(".Button[data-ui-tag='relative-date-shortcut-this-year']")).click();
            await driver.wait(until.elementLocated(By.css(".Button[data-ui-tag='add-filter']:not(.disabled)")));
            await driver.findElement(By.css(".Button[data-ui-tag='add-filter']")).click();

            // select aggregations
            await driver.wait(until.elementLocated(By.css("img[src='/app/img/qb_tutorial/calculator.png']")));
            await driver.findElement(By.css(".Query-section.Query-section-aggregation.cursor-pointer")).click();
            await driver.findElement(By.css(".PopoverBody .List-item:nth-child(2)")).click();

            // select breakouts
            await driver.wait(until.elementLocated(By.css("img[src='/app/img/qb_tutorial/banana.png']")));
            await driver.findElement(By.css(".Query-section.Query-section-breakout>div")).click();

            await driver.findElement(By.css(".PopoverBody .List-item:first-child>div>a")).click();
            await driver.wait(until.elementLocated(By.css(".PopoverBody>div>ul>.List-item:nth-child(3)")));
            await driver.findElement(By.css(".PopoverBody>div>ul>.List-item:nth-child(3)")).click();

            // run query
            await driver.wait(until.elementLocated(By.css("img[src='/app/img/qb_tutorial/rocket.png']")));
            await driver.findElement(By.css(".Button.RunButton")).click();

            await driver.wait(until.elementLocated(By.css("img[src='/app/img/qb_tutorial/chart.png']")));
            await driver.findElement(By.css(".VisualizationSettings>div>a")).click();
            await driver.wait(until.elementLocated(By.css(".PopoverBody li:nth-child(3)")));
            await driver.findElement(By.css(".PopoverBody li:nth-child(3)")).click();

            // end tutorial
            await driver.wait(until.elementLocated(By.css("img[src='/app/img/qb_tutorial/boat.png']")));
            await driver.findElement(By.css(".Modal .Button.Button--primary")).click();
            await driver.findElement(By.css(".PopoverBody .Button.Button--primary")).click();

            await screenshot(driver, "screenshots/setup-tutorial-qb-end.png");
        });
    });

    afterAll(async () => {
        await cleanup({ server, sauceConnect, driver });
    });
});
