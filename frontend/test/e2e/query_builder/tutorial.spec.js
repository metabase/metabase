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
    loginMetabase,
    describeE2E,
    ensureLoggedIn
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describeE2E("tutorial", () => {
    beforeAll(async () => {
        await ensureLoggedIn(server, driver, "bob@metabase.com", "12341234");
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
        try {
            // in a try/catch in case the instance only has one db
            await waitForElementAndClick(driver, "#DatabaseSchemaPicker .List-section:last-child .List-section-header", 1000);
        } catch (e) {
        }

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
        // await driver.sleep(500);
        await waitForElementAndClick(driver, "#VisualizationPopover li:nth-child(4)");

        // end tutorial
        await waitForElement(driver, "img[src='/app/img/qb_tutorial/boat.png']");
        await waitForElementAndClick(driver, ".Modal .Button.Button--primary");
        await waitForElementAndClick(driver, ".PopoverBody .Button.Button--primary");

        await screenshot(driver, "screenshots/setup-tutorial-qb-end.png");
    });
});
