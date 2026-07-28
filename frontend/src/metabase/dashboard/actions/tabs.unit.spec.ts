import { createMockParameter } from "metabase-types/api/mocks";

import { TEST_DASHBOARD_STATE } from "../components/DashboardTabs/test-utils";

import {
  deleteTab,
  getIdFromSlug,
  moveTab,
  tabsReducer,
  undoDeleteTab,
} from "./tabs";

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
    expect(newDashState.dashboards[1].tabs?.map((t) => t.id)).toEqual([
      2, 3, 1,
    ]);
  });

  it("should remove a tab's inline filters instead of leaving them as orphaned dashboard-level filters (metabase#78567)", () => {
    const inlineParameter = createMockParameter({ id: "inline-param" });
    const stateWithInlineParameter = {
      ...TEST_DASHBOARD_STATE,
      dashboards: {
        ...TEST_DASHBOARD_STATE.dashboards,
        1: {
          ...TEST_DASHBOARD_STATE.dashboards[1],
          parameters: [inlineParameter],
        },
      },
      dashcards: {
        ...TEST_DASHBOARD_STATE.dashcards,
        2: {
          ...TEST_DASHBOARD_STATE.dashcards[2],
          inline_parameters: [inlineParameter.id],
        },
      },
    };

    const afterDelete = tabsReducer(
      stateWithInlineParameter,
      deleteTab({ tabId: 2, tabDeletionId: 1 }),
    );

    expect(afterDelete.dashboards[1].parameters).toEqual([]);
    expect(afterDelete.tabDeletions[1].removedParameters).toEqual([
      inlineParameter,
    ]);

    const afterUndo = tabsReducer(
      afterDelete,
      undoDeleteTab({ tabDeletionId: 1 }),
    );

    expect(afterUndo.dashboards[1].parameters).toEqual([inlineParameter]);
    expect(afterUndo.tabDeletions[1]).toBeUndefined();
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
