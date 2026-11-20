import { renderWithProviders, screen } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { AnalysisResult } from "./AnalysisResult";

registerVisualizations();

const TITLE = "How many days did people show up?";

const RAW_SERIES: RawSeries = [
  {
    card: createMockCard({
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["periods"],
        "graph.metrics": ["people"],
      },
    }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "periods", base_type: "type/Integer" }),
        createMockColumn({ name: "people", base_type: "type/Integer" }),
      ],
      rows: [
        [1, 10],
        [2, 5],
      ],
    }),
  },
];

type SetupOpts = {
  rawSeries?: RawSeries | null;
  isRunning?: boolean;
  error?: string;
};

const setup = ({ rawSeries = null, isRunning = false, error }: SetupOpts) =>
  renderWithProviders(
    <AnalysisResult
      title={TITLE}
      display="bar"
      rawSeries={rawSeries}
      isRunning={isRunning}
      error={error}
    />,
  );

describe("AnalysisResult", () => {
  it("shows a skeleton while the analysis runs", () => {
    setup({ isRunning: true });

    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();
    expect(screen.getByTestId("analysis-result-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("visualization-root")).not.toBeInTheDocument();
  });

  it("shows the chart once there's a result", async () => {
    setup({ rawSeries: RAW_SERIES });

    expect(await screen.findByTestId("visualization-root")).toBeInTheDocument();
    expect(
      screen.queryByTestId("analysis-result-skeleton"),
    ).not.toBeInTheDocument();
  });

  it("shows why the analysis failed", () => {
    setup({ error: "The table is gone" });

    expect(screen.getByText("The table is gone")).toBeInTheDocument();
    expect(screen.queryByTestId("visualization-root")).not.toBeInTheDocument();
  });
});
