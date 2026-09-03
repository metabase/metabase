import fetchMock from "fetch-mock";

import { DYNAMIC_GOAL_CARTESIAN_DISPLAYS } from "__support__/dynamic-goals";
import { setupCardDataset } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { delay } from "__support__/utils";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type {
  DatasetData,
  RawSeries,
  ReferencedEntitiesResults,
  VisualizationDisplay,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

registerVisualizations();

// Chart components are loaded on demand. Register them up front so each test
// renders in one pass and can be run on its own.
beforeAll(() =>
  loadVisualizationComponents([...DYNAMIC_GOAL_CARTESIAN_DISPLAYS]),
);

const COLS = [
  createMockColumn({ name: "month", base_type: "type/Text" }),
  createMockColumn({ name: "count", base_type: "type/Integer" }),
];

const ROWS = [
  ["Jan", 1],
  ["Feb", 2],
  ["Mar", 3],
];

const GOAL_LABEL = "Target";
const GOAL_ERROR = "Couldn't load the value this chart's goal depends on.";

const ANSWERED: ReferencedEntitiesResults = {
  card: {
    9: {
      status: "completed",
      data: { cols: [createMockColumn({ name: "goal" })], rows: [[250]] },
    },
  },
};

const FAILED: ReferencedEntitiesResults = {
  card: { 9: { status: "failed", error: "boom" } },
};

function createSeries(
  display: VisualizationDisplay,
  referenced_entities?: DatasetData["referenced_entities"],
): RawSeries {
  return [
    {
      card: createMockCard({
        display,
        visualization_settings: {
          "graph.dimensions": ["month"],
          "graph.metrics": ["count"],
          "graph.show_goal": true,
          "graph.goal_label": GOAL_LABEL,
          "graph.goal_value": { type: "card", id: 9, column: "goal" },
        },
      }),
      data: createMockDatasetData({
        cols: COLS,
        rows: ROWS,
        referenced_entities,
      }),
    },
  ];
}

async function setup(rawSeries: RawSeries) {
  renderWithProviders(<Visualization rawSeries={rawSeries} />);
  // ExplicitSize sets the chart dimensions after mounting
  await delay(0);
}

function getGoalLineLabel() {
  return screen.getByText(GOAL_LABEL);
}

describe.each(DYNAMIC_GOAL_CARTESIAN_DISPLAYS)(
  "%s chart dynamic goal",
  (display) => {
    it("draws the goal line at the value answered by the dataset", async () => {
      await setup(createSeries(display, ANSWERED));

      expect(getGoalLineLabel()).toBeInTheDocument();
      // the goal is far above every data point, so it stretches the y-axis up to it
      expect(screen.getByText("250")).toBeInTheDocument();
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
      expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
    });

    it("shows a loader until an unanswered reference is fetched, then draws the goal", async () => {
      fetchMock.post(
        "path:/api/dataset",
        createMockDataset({
          data: createMockDatasetData({ referenced_entities: ANSWERED }),
        }),
        {
          delay: 100, // keep the reference unanswered long enough to see the loader
        },
      );

      await setup(createSeries(display));

      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
      expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();

      await waitFor(() => expect(getGoalLineLabel()).toBeInTheDocument());
      expect(screen.getByText("250")).toBeInTheDocument();
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();

      const [call] = fetchMock.callHistory.calls("path:/api/dataset");
      expect(await call.request?.json()).toMatchObject({
        referenced_entities: [{ type: "card", id: 9 }],
      });
    });

    it("shows the failed message when fetching the reference fails", async () => {
      setupCardDataset({ status: 500 });

      await setup(createSeries(display));

      expect(await screen.findByText(GOAL_ERROR)).toBeInTheDocument();
      expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
    });

    it("refuses to render when the dataset reports the reference as failed", async () => {
      await setup(createSeries(display, FAILED));

      expect(screen.getByText(GOAL_ERROR)).toBeInTheDocument();
      expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
      expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
    });
  },
);
