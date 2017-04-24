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

        it("should let you create new dashboards, see them, filter them and enter them", async () => {
            await d.get("/dashboard");
            await d.screenshot("screenshots/dashboards.png");

            await createDashboardInEmptyState();

            // Return to the dashboard list and re-enter the card through the list item
            await driver.get(`${server.host}/dashboard`);
            await d.select(".Grid-cell > a").wait().click();
            await d.waitUrl(getLatestDashboardUrl());

            // Create another one
            await d.get(`${server.host}/dashboard`);
            await d.select(".Icon.Icon-add").wait().click();
            await d.select("#CreateDashboardModal input[name='name']").wait().sendKeys("Some Excessively Long Dashboard Title Just For Fun");
            await d.select("#CreateDashboardModal input[name='description']").wait().sendKeys("");
            await d.select("#CreateDashboardModal .Button--primary").wait().click();
            incrementDashboardCount();
            await d.waitUrl(getLatestDashboardUrl());

            // Test filtering
            await d.get(`${server.host}/dashboard`);
            await d.select("input[type='text']").wait().sendKeys("this should produce no results");
            await d.select("img[src*='empty_dashboard']");

            // Should search from both title and description
            await d.select("input[type='text']").wait().clear().sendKeys("usual response times");
            await d.select(".Grid-cell > a").wait().click();
            await d.waitUrl(getPreviousDashboardUrl(1));

            // Remove the created dashboards to prevent clashes with other tests
            await removeCurrentDash();
            // Should return to dashboard page where only one dash left
            await d.select(".Grid-cell > a").wait().click();
            await removeCurrentDash();
        });

    });
});
