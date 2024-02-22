import { TEST_DASHBOARD_STATE } from "../components/DashboardTabs/test-utils";

import { getIdFromSlug, moveTab, tabsReducer } from "./tabs";

/**
 * It's preferred to write tests in `DashboardTabs.unit.spec.tsx`,
 * only write tests here for things that are not easily testable at the component level or in Cypress.
 */
describe("tabsReducer", () => {
  it("should reorder the tabs when MOVE_TAB is dispatched", () => {
    const newDashState = tabsReducer(
      TEST_DASHBOARD_STATE,
      moveTab({ sourceTabId: 1, destinationTabId: 3 }),
    );
    expect(newDashState.dashboards[1].tabs?.map(t => t.id)).toEqual([2, 3, 1]);
  });
});

describe("getIdFromSlug", () => {
  it("should return the id as a number if slug is valid", () => {
    expect(getIdFromSlug("1-tab-name")).toEqual(1);
    expect(getIdFromSlug("1")).toEqual(1);
  });

  it("should return undefined if slug is invalid", () => {
    expect(getIdFromSlug("1tabname")).toEqual(undefined);
    expect(getIdFromSlug("tab-name")).toEqual(undefined);
  });
});
