import {
    createTestStore,
    login
} from "__support__/integrated_tests";
import {
    click,
    clickButton,
    setInputValue
} from "__support__/enzyme_utils"

import { mount } from "enzyme";
import { delay } from "metabase/lib/promise"
import { FETCH_DASHBOARDS } from "metabase/dashboards/dashboards";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import { FETCH_DASHBOARD } from "metabase/dashboard/dashboard";
import { DashboardApi } from "metabase/services";
import { DashboardListItem } from "metabase/dashboards/components/DashboardList";
import SearchHeader from "metabase/components/SearchHeader";
import EmptyState from "metabase/components/EmptyState";

describe("dashboards list", () => {
    const dashboardIds = []

    beforeAll(async () => {
        await login();
    })

    afterAll(async () => {
        // archive all created dashboard to get back to clean start state
        await Promise.all(dashboardIds.map((id) => DashboardApi.update({ id, archived: true })))
    })

    it("should let you create new dashboards, see them, filter them and enter them", async () => {
        const store = await createTestStore();
        store.pushPath("/dashboards")
        const app = mount(store.getAppContainer());

        await store.waitForActions([FETCH_DASHBOARDS])

        // // Create a new dashboard in the empty state (EmptyState react component)
        click(app.find(".Button.Button--primary"))
        // click(app.find(".Icon.Icon-add"))

        const modal = app.find(CreateDashboardModal)

        setInputValue(modal.find('input[name="name"]'), "Customer Feedback Analysis")
        setInputValue(modal.find('input[name="description"]'), "For seeing the usual response times, feedback topics, our response rate, how often customers are directed to our knowledge base instead of providing a customized response")
        click(modal.find(".Button--primary"))

        // should navigate to dashboard page
        await store.waitForActions(FETCH_DASHBOARD)
        const path = store.getPath()
        expect(path).toMatch(/dashboard/)
        dashboardIds.push(path.split("/").pop())

        // Return to the dashboard list and check that we see an expected list item
        store.pushPath("/dashboards")
        await store.waitForActions([FETCH_DASHBOARDS])
        expect(app.find(DashboardListItem).find("a").prop("href")).toBe("/dashboard/" + dashboardIds[0])

        // Create another one
        click(app.find(".Icon.Icon-add"))
        const modal2 = app.find(CreateDashboardModal)
        setInputValue(modal2.find('input[name="name"]'), "Some Excessively Long Dashboard Title Just For Fun")
        setInputValue(modal2.find('input[name="description"]'), "")
        click(modal2.find(".Button--primary"))

        await store.waitForActions(FETCH_DASHBOARD)
        expect(path).toMatch(/dashboard/)
        dashboardIds.push(path.split("/").pop())

        // Test filtering
        store.pushPath("/dashboards")
        await store.waitForActions([FETCH_DASHBOARDS])
        setInputValue(app.find(SearchHeader).find("input"), "this should produce no results")
        expect(app.find(EmptyState).length).toBe(1)

        // Should search from both title and description
        setInputValue(app.find(SearchHeader).find("input"), "usual response times")
        expect(app.find(DashboardListItem).text()).match(/Customer Feedback Analysis/)
        // await d.select("input[type='text']").wait().clear().sendKeys("usual response times");
        // await d.select(".Grid-cell > a").wait().click();
        // await d.waitUrl(getPreviousDashboardUrl(1));
        //
        // // Should be able to favorite and unfavorite dashboards
        // await d.get("/dashboards")
        // await d.select(".Grid-cell > a .favoriting-button").wait().click();
        //
        // await d.select(":react(ListFilterWidget)").wait().click();
        // await d.select(".PopoverBody--withArrow li > h4:contains(Favorites)").wait().click();
        // await d.select(".Grid-cell > a .favoriting-button").wait().click();
        // await d.select("img[src*='empty_dashboard']");
        //
        // await d.select(":react(ListFilterWidget)").wait().click();
        // await d.select(".PopoverBody--withArrow li > h4:contains(All dashboards)").wait().click();
        //
        // // Should be able to archive and unarchive dashboards
        // // TODO: How to test objects that are in hover?
        // // await d.select(".Grid-cell > a .archival-button").wait().click();
        // // await d.select(".Icon.Icon-viewArchive").wait().click();
        //
        // // Remove the created dashboards to prevent clashes with other tests
        // await d.get(getPreviousDashboardUrl(1));
        // await removeCurrentDash();
        // // Should return to dashboard page where only one dash left
        // await d.select(".Grid-cell > a").wait().click();
        // await removeCurrentDash();
    });

});
