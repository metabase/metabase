import type { InitialChartSettingState } from "metabase/redux/store";

import { CLOSE_CHART_SETTINGS, OPEN_CHART_SETTINGS } from "./actions";
import { queryBuilderReducer } from "./reducer";

type QueryBuilderAction = Parameters<typeof queryBuilderReducer>[1];

describe("queryBuilderReducer", () => {
  describe("OPEN_CHART_SETTINGS", () => {
    it("keeps the sidebar title when the open sidebar moves to another section", () => {
      const state = applyActions([
        openChartSettings({
          initialChartSettings: { section: "Data" },
          showSidebarTitle: true,
        }),
        openChartSettings({ initialChartSettings: { section: "Ranges" } }),
      ]);

      expect(state.uiControls.showSidebarTitle).toBe(true);
      expect(state.uiControls.initialChartSetting).toEqual({
        section: "Ranges",
      });
    });

    it("hides the sidebar title when the sidebar opens again after it was closed", () => {
      const state = applyActions([
        openChartSettings({
          initialChartSettings: { section: "Data" },
          showSidebarTitle: true,
        }),
        { type: CLOSE_CHART_SETTINGS },
        openChartSettings({ initialChartSettings: { section: "Ranges" } }),
      ]);

      expect(state.uiControls.showSidebarTitle).toBe(false);
    });

    it("hides the sidebar title when the open sidebar is asked to hide it", () => {
      const state = applyActions([
        openChartSettings({ showSidebarTitle: true }),
        openChartSettings({ showSidebarTitle: false }),
      ]);

      expect(state.uiControls.showSidebarTitle).toBe(false);
    });
  });
});

function openChartSettings(payload: {
  initialChartSettings?: InitialChartSettingState;
  showSidebarTitle?: boolean;
}): QueryBuilderAction {
  return { type: OPEN_CHART_SETTINGS, payload };
}

function applyActions(actions: QueryBuilderAction[]) {
  return actions.reduce(
    queryBuilderReducer,
    queryBuilderReducer(undefined, { type: "@@INIT" }),
  );
}
