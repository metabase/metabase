import {
    describeE2E,
    ensureLoggedIn
} from "../support/utils";

import {removeCurrentDash} from "../dashboard/dashboard.utils";
import {
    createDashboardInEmptyState, getLatestDashboardUrl,
    incrementDashboardCount
} from "../dashboards/dashboards.utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describeE2E("query_builder", () => {
    beforeEach(async () => {
        await ensureLoggedIn(server, driver, "bob@metabase.com", "12341234");
    });

    describe("tables", () => {
        it("should allow users to create pivot tables", async () => {
            // load the query builder and screenshot blank
            await d.get("/question");
            await d.screenshot("screenshots/qb-initial.png");

            // pick the orders table (assumes database is already selected, i.e. there's only 1 database)
            await d.select("#TablePicker .List-item a:contains(Orders)").wait().click();

            await d.select(":react(AggregationWidget)").wait().click();

            await d.select("#AggregationPopover .List-item a:contains(Count)").wait().click();

            await d.select(".Query-section.Query-section-breakout #BreakoutWidget").wait().click();
            await d.select("#BreakoutPopover .List-section .List-section-header:contains(Product)").wait().click();
            await d.select("#BreakoutPopover .List-item a:contains(Category)").wait().click();

            await d.select(".Query-section.Query-section-breakout #BreakoutWidget .AddButton").wait().click();
            await d.select("#BreakoutPopover .List-item:contains(Created) .Field-extra > a").wait().click();
            await d.select("#TimeGroupingPopover .List-item a:contains(Year)").wait().click();

            await d.select(".Button.RunButton").wait().click();

            await d.sleep(500);
            await d.select(".Loading").waitRemoved(20000);
            await d.screenshot("screenshots/qb-pivot-table.png");

            // save question
            await d.select(".Header-buttonSection:first-child").wait().click();
            await d.select("#SaveQuestionModal input[name='name']").wait().sendKeys("Pivot Table");
            await d.select("#SaveQuestionModal .Button.Button--primary").wait().click().waitRemoved(); // wait for the modal to be removed

            // add to new dashboard
            await d.select("#QuestionSavedModal .Button.Button--primary").wait().click();
            try {
                // this makes the test work wether we have any existing dashboards or not
                await d.select("#AddToDashSelectDashModal h3:contains(Add)").wait(500).click();
            } catch (e) {
            }

            await d.select("#CreateDashboardModal input[name='name']").wait().sendKeys("Main Dashboard");
            await d.select("#CreateDashboardModal .Button.Button--primary").wait().click().waitRemoved(); // wait for the modal to be removed
            incrementDashboardCount();

            await d.waitUrl(getLatestDashboardUrl());

            // save dashboard
            await d.select(".EditHeader .Button.Button--primary").wait().click();
            await d.select(".EditHeader").waitRemoved();

            await removeCurrentDash();
        });
    });

    describe("charts", () => {
        xit("should allow users to create line charts", async () => {
            await createDashboardInEmptyState();

            await d.get("/question");

            // select orders table
            await d.select("#TablePicker .List-item:first-child>a").wait().click();

            // select filters
            await d.select(".GuiBuilder-filtered-by .Query-section:not(.disabled) a").wait().click();

            await d.select("#FilterPopover .List-item:first-child>a").wait().click();

            await d.select(".Button[data-ui-tag='relative-date-shortcut-this-year']").wait().click();
            await d.select(".Button[data-ui-tag='add-filter']:not(.disabled)").wait().click();

            // select aggregations
            await d.select("#Query-section-aggregation").wait().click();
            await d.select("#AggregationPopover .List-item:nth-child(2)>a").wait().click();

            // select breakouts
            await d.select(".Query-section.Query-section-breakout>div").wait().click();

            await d.select("#BreakoutPopover .List-item:first-child .Field-extra>a").wait().click();
            await d.select("#TimeGroupingPopover .List-item:nth-child(3)>a").wait().click();

            // run query
            await d.select(".Button.RunButton").wait().click();

            await d.select("#VisualizationTrigger").wait().click();
            // this step occassionally fails without the timeout
            await d.sleep(500);
            await d.select("#VisualizationPopover li:nth-child(3)").wait().click();

            await d.screenshot("screenshots/qb-line-chart.png");

            // save question
            await d.select(".Header-buttonSection:first-child").wait().click();
            await d.select("#SaveQuestionModal input[name='name']").wait().sendKeys("Line Chart");
            await d.select("#SaveQuestionModal .Button.Button--primary").wait().click();

            // add to existing dashboard
            await d.sleep(500);
            await d.select("#QuestionSavedModal .Button.Button--primary").wait().click();
            await d.select("#AddToDashSelectDashModal .SortableItemList-list li:first-child>a").wait().click();

            // save dashboard
            await d.select(".EditHeader .Button.Button--primary").wait().click();
            await d.select(".EditHeader").waitRemoved();

            await removeCurrentDash();
        });

        xit("should allow users to create bar charts", async () => {
            await createDashboardInEmptyState();

            // load line chart
            await d.get("/question/2");

            // dismiss saved questions modal
            await d.select(".Modal .Button.Button--primary").wait().click();

            // change breakouts
            await d.select(".View-section-breakout.SelectionModule").wait().click();

            await d.select("#BreakoutPopover .List-item:first-child .Field-extra>a").wait().click();
            await d.select("#TimeGroupingPopover .List-item:nth-child(4)>a").wait().click();

            // change visualization
            await d.select("#VisualizationTrigger").wait().click();
            // this step occassionally fails without the timeout
            await d.sleep(500);
            await d.select("#VisualizationPopover li:nth-child(4)").wait().click();

            // run query
            await d.select(".Button.RunButton").wait().click();
            await d.select(".Loading").waitRemoved(20000);

            await d.screenshot("screenshots/qb-bar-chart.png");

            // save question
            await d.select(".Header-buttonSection:first-child").wait().click();
            await d.select("#SaveQuestionModal input[name='name']").wait().sendKeys("Bar Chart");
            await d.select("#SaveQuestionModal .Button.Button--primary").wait().click();

            // add to existing dashboard
            await d.sleep(500);
            await d.select("#QuestionSavedModal .Button.Button--primary").wait().click();
            await d.select("#AddToDashSelectDashModal .SortableItemList-list li:first-child>a").wait().click();

            // save dashboard
            await d.select(".EditHeader .Button.Button--primary").wait().click();
            await d.select(".EditHeader").waitRemoved();

            await removeCurrentDash();
        });
    });
});
