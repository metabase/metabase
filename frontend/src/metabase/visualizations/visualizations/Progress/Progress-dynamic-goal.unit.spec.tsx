import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type {
  DatasetColumn,
  RawSeries,
  ReferencedEntitiesResults,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockFailedReferencedEntitiesResults,
  createMockReferencedEntitiesResults,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

registerVisualizations();

// Chart components are loaded on demand. Register the progress chart up front so
// each test renders in one pass and can be run on its own.
beforeAll(() => loadVisualizationComponents(["progress"]));

const COLS = [createMockColumn({ name: "count", base_type: "type/Integer" })];
const ROWS = [[50]];
const SELF_GOAL_COLS = [
  ...COLS,
  createMockColumn({ name: "goal", base_type: "type/Integer" }),
];
const SELF_GOAL_SETTINGS: VisualizationSettings = {
  "progress.value": "count",
  "progress.goal": "goal",
};
const SETTINGS: VisualizationSettings = {
  "progress.goal": { type: "card", id: 9, column: "goal" },
};

type SetupOpts = {
  cols?: DatasetColumn[];
  rows?: RowValues[];
  settings?: VisualizationSettings;
  referencedEntities?: ReferencedEntitiesResults;
  isQueryBuilder?: boolean;
};

function setup({
  cols = COLS,
  rows = ROWS,
  settings = SETTINGS,
  referencedEntities,
  isQueryBuilder = false,
}: SetupOpts = {}) {
  const series: RawSeries = [
    createMockSingleSeries(
      createMockCard({ display: "progress", visualization_settings: settings }),
      {
        data: createMockDatasetData({
          cols,
          rows,
          referenced_entities: referencedEntities,
        }),
      },
    ),
  ];

  const onOpenChartSettings = jest.fn();

  renderWithProviders(
    <Visualization
      isQueryBuilder={isQueryBuilder}
      rawSeries={series}
      onOpenChartSettings={onOpenChartSettings}
    />,
  );

  return { series, onOpenChartSettings };
}

describe("progress chart dynamic goal", () => {
  it("measures progress against a static goal value", async () => {
    setup({ settings: { "progress.goal": 250 } });

    expect(await screen.findByText("Goal 250")).toBeInTheDocument();
  });

  it("measures progress against the value answered by the dataset", async () => {
    setup({
      referencedEntities: createMockReferencedEntitiesResults({ value: 250 }),
    });

    expect(await screen.findByText("Goal 250")).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("re-runs the query with the referenced entity when the dataset has no answer", async () => {
    setupCardDataset({
      dataset: {
        data: createMockDatasetData({
          cols: COLS,
          rows: ROWS,
          referenced_entities: createMockReferencedEntitiesResults({
            value: 40,
          }),
        }),
      },
    });
    const { series } = setup();

    expect(await screen.findByText("Goal 40")).toBeInTheDocument();
    expect(screen.getByText("Goal exceeded")).toBeInTheDocument();
    const [call] = fetchMock.callHistory.calls("path:/api/dataset");
    expect(await call.request?.json()).toEqual(
      expect.objectContaining({
        ...series[0].card.dataset_query,
        referenced_entities: [{ type: "card", id: 9 }],
      }),
    );
  });

  it("shows a loader while the referenced value is being fetched", async () => {
    fetchMock.post("path:/api/dataset", new Promise(() => {}));
    setup();

    expect(await screen.findByTestId("loading-indicator")).toBeInTheDocument();
    expect(screen.queryByTestId("progress-bar")).not.toBeInTheDocument();
  });

  it("measures against a goal of 0 with a warning in the query builder when fetching the reference fails", async () => {
    setupCardDataset({ status: 500 });
    setup({ isQueryBuilder: true });

    expect(await screen.findByLabelText("Goal warning")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("Goal 0")).toBeInTheDocument();
    expect(screen.getByText("Goal exceeded")).toBeInTheDocument();
  });

  it("opens the goal settings from the warning", async () => {
    const { onOpenChartSettings } = setup({
      referencedEntities: createMockFailedReferencedEntitiesResults({
        error: "boom",
      }),
      isQueryBuilder: true,
    });

    await userEvent.hover(await screen.findByLabelText("Goal warning"));
    expect(
      await screen.findByText(
        "Couldn't get the goal value. Click to open settings.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);

    await userEvent.click(screen.getByLabelText("Goal warning"));
    expect(onOpenChartSettings).toHaveBeenCalledWith({
      initialChartSettings: { section: "Display" },
    });
  });

  it("measures progress against a goal column of the same question without a warning", async () => {
    setup({
      cols: SELF_GOAL_COLS,
      rows: [[50, 250]],
      settings: SELF_GOAL_SETTINGS,
      isQueryBuilder: true,
    });

    expect(await screen.findByText("Goal 250")).toBeInTheDocument();
    expect(screen.queryByLabelText("Goal warning")).not.toBeInTheDocument();
  });

  it("measures against a goal of 0 with a warning in the query builder when the goal column's cell is null", async () => {
    setup({
      cols: SELF_GOAL_COLS,
      rows: [[50, null]],
      settings: SELF_GOAL_SETTINGS,
      isQueryBuilder: true,
    });

    expect(await screen.findByLabelText("Goal warning")).toBeInTheDocument();
    expect(screen.getByText("Goal 0")).toBeInTheDocument();
  });

  it("measures against a goal of 0 without a warning outside the query builder", async () => {
    setup({ referencedEntities: createMockFailedReferencedEntitiesResults() });

    expect(await screen.findByText("Goal 0")).toBeInTheDocument();
    expect(screen.queryByLabelText("Goal warning")).not.toBeInTheDocument();
  });
});
