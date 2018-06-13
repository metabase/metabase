import {
  createTestStore,
  useSharedAdminLogin,
} from "__support__/integrated_tests";
import { click, clickButton, setInputValue } from "__support__/enzyme_utils";

import { mount } from "enzyme";

import Dashboards from "metabase/entities/dashboards";

import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import { FETCH_DASHBOARD } from "metabase/dashboard/dashboard";
import { DashboardApi } from "metabase/services";
import SearchHeader from "metabase/components/SearchHeader";
import EmptyState from "metabase/components/EmptyState";
import Dashboard from "metabase/dashboard/components/Dashboard";
import ListFilterWidget from "metabase/components/ListFilterWidget";
import ArchivedItem from "metabase/components/ArchivedItem";

/*
 * disable these tests for now since they break with the new way we're doing
 * dashboard listing. the same functionality tested here should be re-tested
 * with a new set of tests that works for the new layout in collection landings
 */
const DashboardListItem =
  "HACK: placeholder to appease linter. this component was removed";
xdescribe("dashboards list", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  afterAll(async () => {
    const dashboardIds = (await DashboardApi.list())
      .filter(dash => !dash.archived)
      .map(dash => dash.id);

    await Promise.all(
      dashboardIds.map(id => DashboardApi.update({ id, archived: true })),
    );
  });

  it("should let you create a dashboard when there are no existing dashboards", async () => {
    const store = await createTestStore();
    store.pushPath("/dashboards");
    const app = mount(store.getAppContainer());

    await store.waitForActions([Dashboards.actionTypes.FETCH_LIST]);

    // // Create a new dashboard in the empty state (EmptyState react component)
    click(app.find(".Button.Button--primary"));
    // click(app.find(".Icon.Icon-add"))

    const modal = app.find(CreateDashboardModal);

    setInputValue(
      modal.find('input[name="name"]'),
      "Customer Feedback Analysis",
    );
    setInputValue(
      modal.find('input[name="description"]'),
      "For seeing the usual response times, feedback topics, our response rate, how often customers are directed to our knowledge base instead of providing a customized response",
    );
    clickButton(modal.find(".Button--primary"));

    // should navigate to dashboard page
    await store.waitForActions(FETCH_DASHBOARD);
    expect(app.find(Dashboard).length).toBe(1);
  });

  it("should let you create a dashboard when there are existing dashboards", async () => {
    // Return to the dashboard list and check that we see an expected list item
    const store = await createTestStore();
    store.pushPath("/dashboards");
    const app = mount(store.getAppContainer());

    await store.waitForActions([Dashboards.actionTypes.FETCH_LIST]);
    expect(app.find(DashboardListItem).length).toBe(1);

    // Create another one
    click(app.find(".Icon.Icon-add"));
    const modal2 = app.find(CreateDashboardModal);
    setInputValue(
      modal2.find('input[name="name"]'),
      "Some Excessively Long Dashboard Title Just For Fun",
    );
    setInputValue(modal2.find('input[name="description"]'), "");
    clickButton(modal2.find(".Button--primary"));

    await store.waitForActions(FETCH_DASHBOARD);
  });

  xit("should let you search form both title and description", async () => {
    const store = await createTestStore();
    store.pushPath("/dashboards");
    const app = mount(store.getAppContainer());
    await store.waitForActions([Dashboards.actionTypes.FETCH_LIST]);

    setInputValue(
      app.find(SearchHeader).find("input"),
      "this should produce no results",
    );
    expect(app.find(EmptyState).length).toBe(1);

    // Should search from both title and description
    setInputValue(app.find(SearchHeader).find("input"), "usual response times");
    expect(app.find(DashboardListItem).text()).toMatch(
      /Customer Feedback Analysis/,
    );
  });

  xit("should let you favorite and unfavorite dashboards", async () => {
    const store = await createTestStore();
    store.pushPath("/dashboards");
    const app = mount(store.getAppContainer());
    await store.waitForActions([Dashboards.actionTypes.FETCH_LIST]);

    click(
      app
        .find(DashboardListItem)
        .first()
        .find(".Icon-staroutline"),
    );
    await store.waitForActions([Dashboards.actionTypes.UPDATE]);
    click(app.find(ListFilterWidget));

    click(app.find(".TestPopover").find('h4[children="Favorites"]'));

    click(
      app
        .find(DashboardListItem)
        .first()
        .find(".Icon-star")
        .first(),
    );
    await store.waitForActions([Dashboards.actionTypes.UPDATE]);
    expect(app.find(EmptyState).length).toBe(1);
  });

  xit("should let you archive and unarchive dashboards", async () => {
    const store = await createTestStore();
    store.pushPath("/dashboards");
    const app = mount(store.getAppContainer());
    await store.waitForActions([Dashboards.actionTypes.FETCH_LIST]);

    click(
      app
        .find(DashboardListItem)
        .first()
        .find(".Icon-archive"),
    );
    await store.waitForActions([Dashboards.actionTypes.UPDATE_ACTION]);

    click(app.find(".Icon-viewArchive"));
    //await store.waitForActions([FETCH_ARCHIVE]);
    expect(app.find(ArchivedItem).length).toBeGreaterThan(0);
  });
});
