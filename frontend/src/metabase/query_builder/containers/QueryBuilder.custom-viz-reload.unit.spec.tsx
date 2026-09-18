import { screen, waitFor } from "__support__/ui";
import { serializeCardForUrl } from "metabase/common/utils/card";
import {
  type LoadCustomVizPluginForDisplayResult,
  PLUGIN_CUSTOM_VIZ,
} from "metabase/plugins";
import type { Dispatch } from "metabase/redux/store";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Visualization } from "metabase/visualizations/types/visualization";
import { registerVisualization, visualizations } from "metabase/viz-core";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type {
  CustomVizDisplayType,
  DatasetData,
  UnsavedCard,
} from "metabase-types/api";
import {
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersCreatedAtDatasetColumn,
} from "metabase-types/api/mocks/presets";

import { cancelQuery } from "../actions";
import { getCard, getFirstQueryResult, getIsRunning } from "../store/selectors";

import { setup } from "./test-utils";

registerVisualizations();

const DISPLAY: CustomVizDisplayType = "custom:reload-demo-viz";
const MISSING_DISPLAY: CustomVizDisplayType = "custom:missing-viz";

const DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [
      createOrdersCreatedAtDatasetColumn({
        source: "breakout",
        unit: "month",
        field_ref: ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
      }),
      createMockNumericColumn({
        name: "count",
        display_name: "Count",
        semantic_type: "type/Quantity",
        source: "aggregation",
        field_ref: ["aggregation", 0],
      }),
    ],
    rows: [
      ["2026-01-01T00:00:00Z", 10],
      ["2026-02-01T00:00:00Z", 20],
    ],
  }),
});

function createUnsavedCustomVizCard(display: CustomVizDisplayType) {
  return createMockUnsavedCard({
    display,
    displayIsLocked: true,
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
    },
  });
}

// A stand-in for a plugin-backed visualization. The query builder only needs a
// registered `custom:` display it can render and check, so the spec builds one
// here rather than reaching into the enterprise custom viz module.
function registerDemoViz() {
  const DemoViz = Object.assign(() => <span>Custom viz rendered</span>, {
    identifier: DISPLAY,
    getUiName: () => "Reload demo viz",
    settings: {},
    checkRenderable: ([{ data }]: { data?: DatasetData }[]) => {
      if (!data?.cols.some(isDate)) {
        throw new Error("Needs a date column");
      }
    },
    noHeader: false,
    canSavePng: false,
    hidden: false,
  });

  // A Visualization is a component carrying static props. Object.assign types
  // the result as the intersection loosely, so name the target explicitly.
  registerVisualization(DemoViz as unknown as Visualization);
}

function setupFromUrlHash(card: UnsavedCard) {
  return setup({
    card,
    dataset: DATASET,
    initialRoute: `/question#${serializeCardForUrl(card, {
      includeDatasetQuery: true,
      includeDisplayIsLocked: true,
    })}`,
  });
}

describe("query builder > unsaved question with a custom viz restored from the URL (metabase#76065)", () => {
  const originalLoadForDisplay =
    PLUGIN_CUSTOM_VIZ.loadCustomVizPluginForDisplay;

  afterEach(() => {
    PLUGIN_CUSTOM_VIZ.loadCustomVizPluginForDisplay = originalLoadForDisplay;
    visualizations.delete(DISPLAY);
  });

  it("keeps the custom viz when its plugin loads during query completion", async () => {
    const loadForDisplay = jest.fn(
      async (): Promise<LoadCustomVizPluginForDisplayResult> => {
        registerDemoViz();
        return { status: "loaded", display: DISPLAY };
      },
    );
    PLUGIN_CUSTOM_VIZ.loadCustomVizPluginForDisplay = loadForDisplay;

    const { store } = await setupFromUrlHash(
      createUnsavedCustomVizCard(DISPLAY),
    );

    expect(await screen.findByText("Custom viz rendered")).toBeInTheDocument();
    expect(loadForDisplay).toHaveBeenCalledWith(expect.anything(), DISPLAY);

    const card = checkNotNull(getCard(store.getState()));
    expect(card.display).toBe(DISPLAY);
  });

  it("falls back to the default display when the plugin is unavailable", async () => {
    const loadForDisplay = jest.fn(
      async (): Promise<LoadCustomVizPluginForDisplayResult> => ({
        status: "unavailable",
      }),
    );
    PLUGIN_CUSTOM_VIZ.loadCustomVizPluginForDisplay = loadForDisplay;

    const { store } = await setupFromUrlHash(
      createUnsavedCustomVizCard(MISSING_DISPLAY),
    );

    await waitFor(() => {
      expect(checkNotNull(getCard(store.getState())).display).not.toBe(
        MISSING_DISPLAY,
      );
    });
    expect(loadForDisplay).toHaveBeenCalledWith(
      expect.anything(),
      MISSING_DISPLAY,
    );
    expect(await screen.findByTestId("chart-container")).toBeInTheDocument();
  });

  it("keeps the custom viz when plugin availability can't be determined", async () => {
    const loadForDisplay = jest.fn(
      async (): Promise<LoadCustomVizPluginForDisplayResult> => ({
        status: "error",
      }),
    );
    PLUGIN_CUSTOM_VIZ.loadCustomVizPluginForDisplay = loadForDisplay;

    const { store } = await setupFromUrlHash(
      createUnsavedCustomVizCard(DISPLAY),
    );

    await waitFor(() => {
      expect(getFirstQueryResult(store.getState())).toBeTruthy();
    });
    const card = checkNotNull(getCard(store.getState()));
    expect(card.display).toBe(DISPLAY);
    expect(card.displayIsLocked).toBe(true);
  });

  it("discards the completed run when the query is cancelled while the plugin loads", async () => {
    const loadForDisplay = jest.fn(
      async (
        dispatch: Dispatch,
      ): Promise<LoadCustomVizPluginForDisplayResult> => {
        dispatch(cancelQuery());
        registerDemoViz();
        return { status: "loaded", display: DISPLAY };
      },
    );
    PLUGIN_CUSTOM_VIZ.loadCustomVizPluginForDisplay = loadForDisplay;

    const { store } = await setupFromUrlHash(
      createUnsavedCustomVizCard(DISPLAY),
    );

    await waitFor(() => expect(loadForDisplay).toHaveBeenCalled());
    expect(getFirstQueryResult(store.getState())).toBeFalsy();
    expect(getIsRunning(store.getState())).toBe(false);
  });
});
