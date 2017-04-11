import {
    waitForElement,
    waitForElementText,
    findElement,
    waitForElementAndClick,
    waitForElementAndSendKeys,
    waitForElementRemoved,
    waitForUrl,
    screenshot,
    loginMetabase,
    describeE2E
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describeE2E("dashboards/dashboards", () => {
    fdescribe("dashboards list", () => {
        it("should let you create new dashboards, see them, filter them and enter them", async () => {
            await driver.get(`${server.host}/`);
            await loginMetabase(driver, "bob@metabase.com", "12341234");
            await waitForUrl(driver, `${server.host}/`);
            await driver.get(`${server.host}/dashboard`);
            await screenshot(driver, "screenshots/dashboards.png");

            // Create a new dashboard in the empty state (EmptyState react component)
            await waitForElementAndClick(driver, ".Button.Button--primary");
            await waitForElementAndSendKeys(driver, "#CreateDashboardModal input[name='name']", "Customer Feedback Analysis")
            await waitForElementAndSendKeys(driver, "#CreateDashboardModal input[name='description']", "For seeing the usual response times, feedback topics, our response rate, how often customers are directed to our knowledge base instead of providing a customized response")
            await waitForElementAndClick(driver, "#CreateDashboardModal .Button--primary");

            // Make sure that the redirect was successful
            await waitForUrl(driver, `${server.host}/dashboard/1`)

            // Return to the dashboard list and re-enter the card through the list item
            await driver.get(`${server.host}/dashboard`);
            await waitForElementAndClick(driver, ".Grid-cell > a");
            await waitForUrl(driver, `${server.host}/dashboard/1`)

            // Create another one
            await driver.get(`${server.host}/dashboard`);
            await waitForElementAndClick(driver, "svg[name='add']");
            await waitForElementAndSendKeys(driver, "#CreateDashboardModal input[name='name']", "Some Excessively Long Dashboard Title Just For Fun")
            await waitForElementAndSendKeys(driver, "#CreateDashboardModal input[name='description']", "")
            await waitForElementAndClick(driver, "#CreateDashboardModal .Button--primary");
            await waitForUrl(driver, `${server.host}/dashboard/2`)

            // Test filtering
            await driver.get(`${server.host}/dashboard`);
            await waitForElementAndSendKeys(driver, "input[type='text']", "this should produce no results")
            await waitForElement(driver, "img[src*='empty_dashboard']");

            // Should search from both title and description
            await waitForElementAndSendKeys(driver, "input[type='text']", "usual response times");
            await waitForElementAndClick(driver, ".Grid-cell > a");
            await waitForUrl(driver, `${server.host}/dashboard/1`)
        });

    });
});
