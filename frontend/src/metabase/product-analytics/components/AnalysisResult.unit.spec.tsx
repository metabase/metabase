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

/** A result whose value renders as text, so tests can tell results apart. */
const createScalarSeries = (value: number): RawSeries => [
  {
    card: createMockCard({ display: "scalar" }),
    data: createMockDatasetData({
      cols: [createMockColumn({ name: "people", base_type: "type/Integer" })],
      rows: [[value]],
    }),
  },
];

const FIRST_RESULT = createScalarSeries(111);
const SECOND_RESULT = createScalarSeries(222);

type SetupOpts = {
  rawSeries?: RawSeries | null;
  isRunning?: boolean;
  error?: string;
};

const getResult = ({
  rawSeries = null,
  isRunning = false,
  error,
}: SetupOpts) => (
  <AnalysisResult
    title={TITLE}
    display="bar"
    rawSeries={rawSeries}
    isRunning={isRunning}
    error={error}
  />
);

const setup = (opts: SetupOpts) => {
  const { rerender } = renderWithProviders(getResult(opts));
  return { rerender: (newOpts: SetupOpts) => rerender(getResult(newOpts)) };
};

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

  it("keeps the last chart under a running overlay while it reruns", async () => {
    const { rerender } = setup({ rawSeries: FIRST_RESULT });
    expect(await screen.findByText("111")).toBeInTheDocument();

    rerender({ isRunning: true });
    expect(screen.getByText("111")).toBeInTheDocument();
    expect(screen.getByText("Doing science...")).toBeInTheDocument();
    expect(
      screen.queryByTestId("analysis-result-skeleton"),
    ).not.toBeInTheDocument();

    rerender({ rawSeries: SECOND_RESULT });
    expect(await screen.findByText("222")).toBeInTheDocument();
    expect(screen.queryByText("111")).not.toBeInTheDocument();
    expect(screen.queryByText("Doing science...")).not.toBeInTheDocument();
  });

  it("drops the last chart when a rerun fails", async () => {
    const { rerender } = setup({ rawSeries: FIRST_RESULT });
    expect(await screen.findByText("111")).toBeInTheDocument();

    rerender({ isRunning: true });
    rerender({ error: "The table is gone" });
    expect(screen.getByText("The table is gone")).toBeInTheDocument();
    expect(screen.queryByTestId("visualization-root")).not.toBeInTheDocument();
  });

  it("doesn't bring back a chart from before a failed run", async () => {
    const { rerender } = setup({ rawSeries: FIRST_RESULT });
    expect(await screen.findByText("111")).toBeInTheDocument();

    rerender({ isRunning: true });
    rerender({ error: "The table is gone" });
    rerender({ isRunning: true });

    expect(screen.queryByText("111")).not.toBeInTheDocument();
    expect(screen.getByTestId("analysis-result-skeleton")).toBeInTheDocument();
  });

  it("shows why the analysis failed", () => {
    setup({ error: "The table is gone" });

    expect(screen.getByText("The table is gone")).toBeInTheDocument();
    expect(screen.queryByTestId("visualization-root")).not.toBeInTheDocument();
  });
});
