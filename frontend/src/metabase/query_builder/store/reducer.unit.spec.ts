import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
} from "__support__/state";
import { EDIT_SUMMARY } from "metabase/redux/query-builder";
import type { InitialChartSettingState } from "metabase/redux/store";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

import {
  CANCEL_QUERY,
  CLOSE_CHART_SETTINGS,
  ON_CLOSE_SUMMARY,
  OPEN_CHART_SETTINGS,
  QUERY_COMPLETED,
  QUERY_ERRORED,
} from "./actions";
import { queryBuilderReducer } from "./reducer";

type QueryBuilderAction = Parameters<typeof queryBuilderReducer>[1];

describe("queryBuilderReducer", () => {
  it.each([
    {
      outcome: "cancellation",
      action: { type: CANCEL_QUERY },
      shouldScroll: false,
    },
    {
      outcome: "request failure",
      action: { type: QUERY_ERRORED, payload: { error: "Request failed" } },
      shouldScroll: false,
    },
    ...[false, true].map((hasError) => ({
      outcome: hasError ? "query failure" : "success",
      action: {
        type: QUERY_COMPLETED,
        payload: {
          card: createMockCard(),
          queryResults: [
            createMockDataset({
              error: hasError ? "Invalid query" : undefined,
            }),
          ],
        },
      },
      shouldScroll: !hasError,
    })),
  ])(
    "only keeps the pending column scroll on success: $outcome",
    ({ action, shouldScroll }) => {
      const state = createMockQueryBuilderState({
        uiControls: createMockQueryBuilderUIControlsState({
          isRunning: true,
          scrollToLastColumn: true,
        }),
      });

      const nextState = queryBuilderReducer(state, action);

      expect(nextState.uiControls.scrollToLastColumn).toBe(shouldScroll);
    },
  );

  it("should keep query state unchanged on Summarize sidebar toggle", () => {
    const card = createMockCard();
    const state = createMockQueryBuilderState({
      card,
      originalCard: card,
      lastRunCard: card,
      queryResults: [createMockDataset()],
    });

    const openedState = queryBuilderReducer(state, { type: EDIT_SUMMARY });
    const closedState = queryBuilderReducer(openedState, {
      type: ON_CLOSE_SUMMARY,
    });

    expect(openedState.uiControls.isShowingSummarySidebar).toBe(true);
    expect(closedState.uiControls.isShowingSummarySidebar).toBe(false);
    for (const nextState of [openedState, closedState]) {
      expect(nextState.card).toBe(state.card);
      expect(nextState.originalCard).toBe(state.originalCard);
      expect(nextState.lastRunCard).toBe(state.lastRunCard);
      expect(nextState.queryResults).toBe(state.queryResults);
      expect(nextState.queryStatus).toBe(state.queryStatus);
    }
  });

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
