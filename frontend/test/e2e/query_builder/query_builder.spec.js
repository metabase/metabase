
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

describeE2E("query_builder", () => {
    beforeEach(async () => {
        await ensureLoggedIn(server, driver, "bob@metabase.com", "12341234");
    });

    describe("tables", () => {
        it("should allow users to create pivot tables", async () => {
            await driver.get(`${server.host}/q`);

            await screenshot(driver, "screenshots/qb-initial.png");

            await waitForElementAndClick(driver, "#TablePicker .List-item:first-child>a");

            await waitForElementAndClick(driver, "#Query-section-aggregation");
            await waitForElementAndClick(driver, "#AggregationPopover .List-item:nth-child(2)>a");

            await waitForElementAndClick(driver, ".Query-section.Query-section-breakout #BreakoutWidget");
            await waitForElementAndClick(driver, "#BreakoutPopover .List-section:nth-child(3) .List-section-header");
            await waitForElementAndClick(driver, "#BreakoutPopover .List-item:nth-child(12)>a");

            await waitForElementAndClick(driver, ".Query-section.Query-section-breakout #BreakoutWidget .AddButton");
            await waitForElementAndClick(driver, "#BreakoutPopover .List-item:first-child .Field-extra>a");
            await waitForElementAndClick(driver, "#TimeGroupingPopover .List-item:nth-child(4)>a");

            await waitForElementAndClick(driver, ".Button.RunButton");

            await waitForElementRemoved(driver, ".Loading", 20000);
            await screenshot(driver, "screenshots/qb-pivot-table.png");

            // save question
            await waitForElementAndClick(driver, ".Header-buttonSection:first-child");
            await waitForElementAndSendKeys(driver, "#SaveQuestionModal input[name='name']", 'Pivot Table');
            await waitForElementAndClick(driver, "#SaveQuestionModal .Button.Button--primary");

            // add to new dashboard
            await waitForElementAndClick(driver, "#QuestionSavedModal .Button.Button--primary");
            await waitForElementAndSendKeys(driver, "#CreateDashboardModal input[name='name']", 'Main Dashboard');
            await waitForElementAndClick(driver, "#CreateDashboardModal .Button.Button--primary");

            // save dashboard
            await waitForElementAndClick(driver, ".EditHeader .Button.Button--primary");
            await waitForElementRemoved(driver, ".EditHeader");
        });
    });

    describe("charts", () => {
        xit("should allow users to create line charts", async () => {
            await driver.get(`${server.host}/q`);

            // select orders table
            await waitForElementAndClick(driver, "#TablePicker .List-item:first-child>a");

            // select filters
            await waitForElementAndClick(driver, ".GuiBuilder-filtered-by .Query-section:not(.disabled) a");

            await waitForElementAndClick(driver, "#FilterPopover .List-item:first-child>a");

            await waitForElementAndClick(driver, ".Button[data-ui-tag='relative-date-shortcut-this-year']");
            await waitForElementAndClick(driver, ".Button[data-ui-tag='add-filter']:not(.disabled)");

            // select aggregations
            await waitForElementAndClick(driver, "#Query-section-aggregation");
            await waitForElementAndClick(driver, "#AggregationPopover .List-item:nth-child(2)>a");

            // select breakouts
            await waitForElementAndClick(driver, ".Query-section.Query-section-breakout>div");

            await waitForElementAndClick(driver, "#BreakoutPopover .List-item:first-child .Field-extra>a");
            await waitForElementAndClick(driver, "#TimeGroupingPopover .List-item:nth-child(3)>a");

            // run query
            await waitForElementAndClick(driver, ".Button.RunButton");

            await waitForElementAndClick(driver, "#VisualizationTrigger");
            // this step occassionally fails without the timeout
            await driver.sleep(500);
            await waitForElementAndClick(driver, "#VisualizationPopover li:nth-child(3)");

            await screenshot(driver, "screenshots/qb-line-chart.png");

            // save question
            await waitForElementAndClick(driver, ".Header-buttonSection:first-child");
            await waitForElementAndSendKeys(driver, "#SaveQuestionModal input[name='name']", 'Line Chart');
            await waitForElementAndClick(driver, "#SaveQuestionModal .Button.Button--primary");

            // add to existing dashboard
            await driver.sleep(500);
            await waitForElementAndClick(driver, "#QuestionSavedModal .Button.Button--primary");
            await waitForElementAndClick(driver, "#AddToDashSelectDashModal .SortableItemList-list li:first-child>a");

            // save dashboard
            await waitForElementAndClick(driver, ".EditHeader .Button.Button--primary");
            await waitForElementRemoved(driver, ".EditHeader");
        });

        xit("should allow users to create bar charts", async () => {
            // load line chart
            await driver.get(`${server.host}/card/2`);

            // dismiss saved questions modal
            await waitForElementAndClick(driver, ".Modal .Button.Button--primary");

            // change breakouts
            await waitForElementAndClick(driver, ".View-section-breakout.SelectionModule");

            await waitForElementAndClick(driver, "#BreakoutPopover .List-item:first-child .Field-extra>a");
            await waitForElementAndClick(driver, "#TimeGroupingPopover .List-item:nth-child(4)>a");

            // change visualization
            await waitForElementAndClick(driver, "#VisualizationTrigger");
            // this step occassionally fails without the timeout
            await driver.sleep(500);
            await waitForElementAndClick(driver, "#VisualizationPopover li:nth-child(4)");

            // run query
            await waitForElementAndClick(driver, ".Button.RunButton");
            await waitForElementRemoved(driver, ".Loading", 20000);

            await screenshot(driver, "screenshots/qb-bar-chart.png");

            // save question
            await waitForElementAndClick(driver, ".Header-buttonSection:first-child");
            await waitForElementAndSendKeys(driver, "#SaveQuestionModal input[name='name']", 'Bar Chart');
            await waitForElementAndClick(driver, "#SaveQuestionModal .Button.Button--primary");

            // add to existing dashboard
            await driver.sleep(500);
            await waitForElementAndClick(driver, "#QuestionSavedModal .Button.Button--primary");
            await waitForElementAndClick(driver, "#AddToDashSelectDashModal .SortableItemList-list li:first-child>a");

            // save dashboard
            await waitForElementAndClick(driver, ".EditHeader .Button.Button--primary");
            await waitForElementRemoved(driver, ".EditHeader");
        });
    });
});
