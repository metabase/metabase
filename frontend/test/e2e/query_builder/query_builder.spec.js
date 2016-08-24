import path from "path";

import { isReady } from "../support/start-server";
import { setup, cleanup } from "../support/setup";
import { By, until } from "selenium-webdriver";

import {
    waitForElement,
    waitForElementRemoved,
    findElement,
    waitForAndClickElement,
    waitForUrl,
    screenshot,
    loginMetabase
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describe("query_builder", () => {
    let server, sauceConnect, driver;

    beforeAll(async () => {
        ({ server, sauceConnect, driver } = await setup());
    });

    it ("should start", async () => {
        expect(await isReady(server.host)).toEqual(true);
    });

    describe("tutorial", () => {
        it("should guide users through query builder tutorial", async () => {
            await driver.get(`${server.host}/`);
            await loginMetabase(driver, "bob@metabase.com", "12341234");
            await waitForUrl(driver, `${server.host}/`);

            await driver.get(`${server.host}/?new`);
            await waitForUrl(driver, `${server.host}/?new`);

            await waitForAndClickElement(driver, ".Modal .Button.Button--primary");
            await waitForAndClickElement(driver, ".Modal .Button.Button--primary");
            await waitForAndClickElement(driver, ".Modal .Button.Button--primary");

            await waitForUrl(driver, `${server.host}/q`);
            await waitForElement(driver, ".Modal .Button.Button--primary");
            await screenshot(driver, "screenshots/setup-tutorial-qb.png");
            await waitForAndClickElement(driver, ".Modal .Button.Button--primary");

            await waitForElement(driver, "img[src='/app/img/qb_tutorial/table.png']");
            // a .Modal-backdrop element blocks clicks for a while during transition?
            await waitForElementRemoved(driver, '.Modal-backdrop');
            await waitForAndClickElement(driver, ".GuiBuilder-data a");

            // // select sample dataset db
            // await waitForAndClickElement(driver, "#DatabaseSchemaPicker .List-section:last-child .List-section-header");

            await waitForAndClickElement(driver, "#TablePicker .List-section-header");

            // select orders table
            await driver.sleep(1000);
            await waitForAndClickElement(driver, "#TablePicker .List-item:first-child>a");

            // select filters
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/funnel.png']");
            await waitForAndClickElement(driver, ".GuiBuilder-filtered-by .Query-section:not(.disabled) a");

            await waitForAndClickElement(driver, "#FilterPopover .List-item:first-child>a");

            await waitForAndClickElement(driver, ".Button[data-ui-tag='relative-date-shortcut-this-year']");
            await driver.sleep(1000);
            await waitForAndClickElement(driver, ".Button[data-ui-tag='add-filter']:not(.disabled)");

            // select aggregations
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/calculator.png']");
            await waitForAndClickElement(driver, "#Query-section-aggregation");
            await driver.sleep(1000);
            await waitForAndClickElement(driver, "#AggregationPopover .List-item:nth-child(2)>a");

            // select breakouts
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/banana.png']");
            await waitForAndClickElement(driver, ".Query-section.Query-section-breakout>div");

            await driver.sleep(1000);
            await waitForAndClickElement(driver, "#BreakoutPopover .List-item:first-child .Field-extra>a");
            await driver.sleep(1000);
            await waitForAndClickElement(driver, "#TimeGroupingPopover .List-item:nth-child(3)>a");

            // run query
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/rocket.png']");
            await driver.sleep(1000);
            await waitForAndClickElement(driver, ".Button.RunButton");

            // await waitForAndClickElement(driver, ".TutorialModal .Button.Button--primary", 60000);
            // await waitForAndClickElement(driver, ".QueryError2-details a", 60000);

            // await driver.sleep(20000);
            // await screenshot(driver, "screenshots/setup-tutorial-qb-loaded.png");
            // const logs = await driver.manage().logs().get("browser");
            // console.log(logs);

            // FIXME: this part errors out on CI for some reason
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/chart.png']", 20000);
            await waitForAndClickElement(driver, "#VisualizationTrigger");
            //FIXME: click doens't consistently land without timeout here
            await driver.sleep(1000);
            await waitForAndClickElement(driver, "#VisualizationPopover li:nth-child(3)");

            // end tutorial
            await waitForElement(driver, "img[src='/app/img/qb_tutorial/boat.png']");
            await waitForAndClickElement(driver, ".Modal .Button.Button--primary");
            await waitForAndClickElement(driver, ".PopoverBody .Button.Button--primary");

            await screenshot(driver, "screenshots/setup-tutorial-qb-end.png");
        });
    });

    describe("tables", () => {
        it("should allow users to create pivot tables", async () => {
            // await driver.get(`${server.host}/`);
            // await loginMetabase(driver, "bob@metabase.com", "12341234");
            // await waitForUrl(driver, `${server.host}/`);

            await driver.get(`${server.host}/q`);

            await screenshot(driver, "screenshots/qb-initial.png");

            await waitForAndClickElement(driver, "#TablePicker .List-item:first-child>a");

            await waitForAndClickElement(driver, "#Query-section-aggregation");
            await waitForAndClickElement(driver, "#AggregationPopover .List-item:nth-child(2)>a");

            await waitForAndClickElement(driver, ".Query-section.Query-section-breakout #BreakoutWidget");
            await waitForAndClickElement(driver, "#BreakoutPopover .List-section:nth-child(3) .List-section-header");
            await waitForAndClickElement(driver, "#BreakoutPopover .List-item:nth-child(12)>a");

            await waitForAndClickElement(driver, ".Query-section.Query-section-breakout #BreakoutWidget .AddButton");
            await waitForAndClickElement(driver, "#BreakoutPopover .List-item:first-child .Field-extra>a");
            await waitForAndClickElement(driver, "#TimeGroupingPopover .List-item:nth-child(4)>a");

            await waitForAndClickElement(driver, ".Button.RunButton");

            await waitForElementRemoved(driver, ".Loading", 20000);
            await screenshot(driver, "screenshots/qb-pivot-table.png");
        });
    });

    afterAll(async () => {
        await cleanup({ server, sauceConnect, driver });
    });
});
