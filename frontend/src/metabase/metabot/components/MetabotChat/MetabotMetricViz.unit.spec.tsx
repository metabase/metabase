import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import type { MetricVizValue } from "metabase/api/ai-streaming/schemas";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { MetabotMetricViz } from "./MetabotMetricViz";

// Visualization pulls in the whole charting stack; stub it so we can unit test the
// run / render-state logic in isolation.
jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: () => <div data-testid="visualization" />,
}));

const value: MetricVizValue = {
  title: "Revenue over headcount",
  display: "line",
  definition: {
    expression: [
      "/",
      {},
      ["metric", { "lib/uuid": "a" }, 1],
      ["metric", { "lib/uuid": "b" }, 2],
    ],
    projections: [],
  },
};

function setupDataset({
  status = 200,
  dataset = createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "created_at" }),
        createMockColumn({ name: "ratio" }),
      ],
      rows: [["2024-01-01", 1.5]],
    }),
  }),
}: {
  status?: number;
  dataset?: unknown;
} = {}) {
  fetchMock.post("path:/api/metric/dataset", { status, body: dataset });
}

function setup(valueOverrides: Partial<MetricVizValue> = {}) {
  return renderWithProviders(
    <MetabotMetricViz value={{ ...value, ...valueOverrides }} />,
  );
}

describe("MetabotMetricViz", () => {
  beforeEach(() => {
    fetchMock.clearHistory();
  });

  it("posts the definition to /api/metric/dataset and renders the visualization", async () => {
    setupDataset();
    setup();
    expect(screen.getByTestId("metabot-metric-viz")).toBeInTheDocument();
    expect(await screen.findByTestId("visualization")).toBeInTheDocument();
    expect(fetchMock.callHistory.called("path:/api/metric/dataset")).toBe(true);
  });

  it("shows the title", () => {
    setupDataset();
    setup();
    expect(screen.getByText("Revenue over headcount")).toBeInTheDocument();
  });

  it("does not render the visualization while results are loading", () => {
    setupDataset();
    setup();
    expect(screen.queryByTestId("visualization")).not.toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    setupDataset({ status: 500 });
    setup();
    expect(screen.queryByTestId("visualization")).not.toBeInTheDocument();
    expect(
      await screen.findByText("There was a problem displaying this chart."),
    ).toBeInTheDocument();
  });
});
