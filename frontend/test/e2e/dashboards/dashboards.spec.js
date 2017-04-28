import {
    ensureLoggedIn,
    describeE2E
} from "../support/utils";

import {
    createDashboardInEmptyState, getLatestDashboardUrl, getPreviousDashboardUrl,
    incrementDashboardCount
} from "./dashboards.utils"
import {removeCurrentDash} from "../dashboard/dashboard.utils"

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describeE2E("dashboards/dashboards", () => {
    describe("dashboards list", () => {
        beforeEach(async () => {
            await ensureLoggedIn(server, driver, "bob@metabase.com", "12341234");
        });

        xit("should let you create new dashboards, see them, filter them and enter them", async () => {
            await d.get("/dashboards");
            await d.screenshot("screenshots/dashboards.png");

            await createDashboardInEmptyState();

            // Return to the dashboard list and re-enter the card through the list item
            await driver.get(`${server.host}/dashboards`);
            await d.select(".Grid-cell > a").wait().click();
            await d.waitUrl(getLatestDashboardUrl());

            // Create another one
            await d.get(`${server.host}/dashboards`);
            await d.select(".Icon.Icon-add").wait().click();
            await d.select("#CreateDashboardModal input[name='name']").wait().sendKeys("Some Excessively Long Dashboard Title Just For Fun");
            await d.select("#CreateDashboardModal input[name='description']").wait().sendKeys("");
            await d.select("#CreateDashboardModal .Button--primary").wait().click();
            incrementDashboardCount();
            await d.waitUrl(getLatestDashboardUrl());

            // Test filtering
            await d.get(`${server.host}/dashboards`);
            await d.select("input[type='text']").wait().sendKeys("this should produce no results");
            await d.select("img[src*='empty_dashboard']");

            // Should search from both title and description
            await d.select("input[type='text']").wait().clear().sendKeys("usual response times");
            await d.select(".Grid-cell > a").wait().click();
            await d.waitUrl(getPreviousDashboardUrl(1));

            // Should be able to favorite and unfavorite dashboards
            await d.get("/dashboards")
            await d.select(".Grid-cell > a .favoriting-button").wait().click();

            await d.select(":react(ListFilterWidget)").wait().click();
            await d.select(".PopoverBody--withArrow li > h4:contains(Favorites)").wait().click();
            await d.select(".Grid-cell > a .favoriting-button").wait().click();
            await d.select("img[src*='empty_dashboard']");

            await d.select(":react(ListFilterWidget)").wait().click();
            await d.select(".PopoverBody--withArrow li > h4:contains(All dashboards)").wait().click();

            // Should be able to archive and unarchive dashboards
            // TODO: How to test objects that are in hover?
            // await d.select(".Grid-cell > a .archival-button").wait().click();
            // await d.select(".Icon.Icon-viewArchive").wait().click();

            // Remove the created dashboards to prevent clashes with other tests
            await d.get(getPreviousDashboardUrl(1));
            await removeCurrentDash();
            // Should return to dashboard page where only one dash left
            await d.select(".Grid-cell > a").wait().click();
            await removeCurrentDash();
        });

    });
});
