import {
    ensureLoggedIn,
    describeE2E
} from "../support/utils";

import {createDashboardInEmptyState} from "../dashboards/dashboards.utils"
import {removeCurrentDash} from "../dashboard/dashboard.utils"

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

const EDIT_DASHBOARD_SELECTOR = ".Icon.Icon-pencil";
const SAVE_DASHBOARD_SELECTOR = ".EditHeader .flex-align-right .Button--primary.Button";

describeE2E("dashboards/dashboards", () => {
    beforeEach(async () => {
        await ensureLoggedIn(server, driver, "bob@metabase.com", "12341234");
    });

    describe("dashboards list", () => {
        xit("should let you create new dashboards, see them, filter them and enter them", async () => {
            // Delegate dashboard creation to dashboard list test code
            await createDashboardInEmptyState();

            // Test dashboard renaming
            await d.select(EDIT_DASHBOARD_SELECTOR).wait().click();
            await d.select(".Header-title > input:nth-of-type(1)").wait().clear().sendKeys("Customer Analysis Paralysis");
            await d.select(".Header-title > input:nth-of-type(2)").wait().sendKeys(""); // Test empty description

            await d.select(SAVE_DASHBOARD_SELECTOR).wait().click();
            await d.select(".DashboardHeader h2:contains(Paralysis)").wait();

            // Test parameter filter creation
            await d.select(EDIT_DASHBOARD_SELECTOR).wait().click();
            await d.select(".Icon.Icon-funneladd").wait().click();

            // TODO: After `annotate-react-dom` supports functional components in production builds, use this instead:
            // `await d.select(":react(ParameterOptionsSection):contains(Time)").wait().click();`
            await d.select(".PopoverBody--withArrow li > div:contains(Time)").wait().click();

            // TODO: Replace when possible with `await d.select(":react(ParameterOptionItem):contains(Relative)").wait().click()`;
            await d.select(".PopoverBody--withArrow li > div:contains(Relative)").wait().click(); // Relative date

            await d.select(":react(ParameterValueWidget)").wait().click();
            await d.select(":react(PredefinedRelativeDatePicker) button:contains(Yesterday)").wait().click();
            expect(await d.select(":react(ParameterValueWidget) .text-nowrap").wait().text()).toEqual("Yesterday");

            // TODO: Replace when possible with `await d.select(":react(HeaderModal) button:contains(Done)").wait().click();`
            await d.select(".absolute.top.left.right button:contains(Done)").wait().click();
            // Wait until the header modal exit animation is finished
            await d.sleep(1000);
            // Remove the created dashboards to prevent clashes with other tests
            await removeCurrentDash();
        });

    });
});
