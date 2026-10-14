import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type {
  RawSeries,
  ReferencedEntitiesResults,
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
const SETTINGS: VisualizationSettings = {
  "progress.goal": { type: "card", id: 9, column: "goal" },
};

type SetupOpts = {
  settings?: VisualizationSettings;
  referencedEntities?: ReferencedEntitiesResults;
};

function setup({ settings = SETTINGS, referencedEntities }: SetupOpts = {}) {
  const series: RawSeries = [
    createMockSingleSeries(
      createMockCard({ display: "progress", visualization_settings: settings }),
      {
        data: createMockDatasetData({
          cols: COLS,
          rows: ROWS,
          referenced_entities: referencedEntities,
        }),
      },
    ),
  ];

  renderWithProviders(<Visualization rawSeries={series} />);

  return { series };
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

  it("measures against a goal of 0 when fetching the reference fails", async () => {
    setupCardDataset({ status: 500 });
    setup();

    expect(await screen.findByText("Goal 0")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("Goal exceeded")).toBeInTheDocument();
  });

  it("measures against a goal of 0 when the dataset reports the reference as failed", async () => {
    setup({ referencedEntities: createMockFailedReferencedEntitiesResults() });

    expect(await screen.findByText("Goal 0")).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });
});
