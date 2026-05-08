import { renderWithProviders, screen, within } from "__support__/ui";
import type {
  Dataset,
  ExplorationQuery,
  ExplorationQueryGroup,
  ExplorationQueryStatus,
  ExplorationThread,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { ExplorationGroupVisualization } from "./ExplorationGroupVisualization";

// The real `Visualization` is heavy and pulls ECharts; we only care that
// it receives the right `rawSeries` shape.
jest.mock("metabase/visualizations/components/Visualization", () => {
  const Visualization = (props: any) => (
    <div
      data-testid="visualization-stub"
      data-raw-series={JSON.stringify(props.rawSeries)}
    />
  );
  return { __esModule: true, default: Visualization };
});

// Stub the per-query result hook so we can drive datasets from each test.
const mockDatasetsByQueryId = new Map<number, Dataset | undefined>();
jest.mock("metabase/api/exploration", () => ({
  __esModule: true,
  useGetExplorationQueryResultQuery: (id: number) => ({
    currentData: mockDatasetsByQueryId.get(id),
    isLoading: !mockDatasetsByQueryId.has(id),
  }),
  useAppendChartToDocumentMutation: () => [jest.fn()],
  useCreateExplorationDocumentMutation: () => [jest.fn()],
}));

// Stub adhoc-metadata to be instantly done.
jest.mock("metabase/api/dataset", () => ({
  __esModule: true,
  useGetAdhocQueryMetadataQuery: () => ({ isLoading: false }),
}));

// `Lib.fromJsQueryAndMetadata` + `Lib.defaultDisplay` need a working
// metadata graph; bypass them by stubbing to a deterministic default
// that individual tests can swap out via `mockDefaultDisplay.value`.
const mockDefaultDisplay = {
  value: {
    display: "line",
    settings: { "graph.x_axis.scale": "timeseries" } as Record<string, unknown>,
  },
};
jest.mock("metabase-lib", () => ({
  __esModule: true,
  fromJsQueryAndMetadata: () => ({}) as any,
  defaultDisplay: () => mockDefaultDisplay.value,
}));

jest.mock("metabase-lib/v1/types/utils/isa", () => ({
  __esModule: true,
  isDate: () => true,
}));

jest.mock("metabase/visualizations", () => ({
  __esModule: true,
  isCartesianChart: (display: string) =>
    ["line", "bar", "area", "combo", "row", "scatter", "waterfall"].includes(
      display,
    ),
}));

// `useElementSize` measures the chart card directly. Mock it so tests
// can assert chunking behavior at known card heights — jsdom's
// ResizeObserver doesn't compute real layout dimensions.
const mockElementSize = { value: { width: 0, height: 0 } };
jest.mock("@mantine/hooks", () => ({
  ...jest.requireActual("@mantine/hooks"),
  useElementSize: () => ({
    ref: jest.fn(),
    width: mockElementSize.value.width,
    height: mockElementSize.value.height,
  }),
}));

function makeQuery(
  overrides: Partial<ExplorationQuery> & {
    id: number;
    name: string;
    status: ExplorationQueryStatus;
  },
): ExplorationQuery {
  return {
    exploration_thread_id: 1,
    card_id: 1,
    dimension_id: "dim-1",
    position: 0,
    error_message: null,
    started_at: null,
    finished_at: null,
    entity_id: "abcdefghijabcdefghij1",
    interestingness_score: 0.5,
    dataset_query: { type: "query", database: 1, query: {} } as any,
    segment_id: null,
    ...overrides,
  };
}

function makeDataset(): Dataset {
  return createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "ts", base_type: "type/DateTime" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      rows: [
        ["2025-01-01", 1],
        ["2025-02-01", 2],
      ],
    }),
  });
}

const thread: ExplorationThread = {
  id: 1,
  exploration_id: 1,
  name: null,
  prompt: null,
  position: 0,
  started_at: null,
  completed_at: null,
  entity_id: "thrd00000000000000001",
  created_at: "2026-04-30T00:00:00Z",
  updated_at: "2026-04-30T00:00:00Z",
};

const group: ExplorationQueryGroup = {
  id: "auto:1:dim-page",
  parent_group_id: null,
  position: 0,
  type: "auto",
  display_type: "page",
  name: "Revenue across regions",
  query_ids: [101, 102],
};

interface SetupOpts {
  queries: ExplorationQuery[];
  datasets?: Map<number, Dataset>;
}

function setup({ queries, datasets }: SetupOpts) {
  mockDatasetsByQueryId.clear();
  if (datasets) {
    for (const [id, ds] of datasets) {
      mockDatasetsByQueryId.set(id, ds);
    }
  }

  renderWithProviders(
    <ExplorationGroupVisualization
      group={{ ...group, query_ids: queries.map((q) => q.id) }}
      queries={queries}
      explorationThread={thread}
      availableTimelines={[]}
      selectedTimelineId={null}
      onSelectTimelineId={jest.fn()}
      timelineEvents={[]}
    />,
  );
}

describe("ExplorationGroupVisualization", () => {
  afterEach(() => {
    mockDatasetsByQueryId.clear();
    mockDefaultDisplay.value = {
      display: "line",
      settings: { "graph.x_axis.scale": "timeseries" },
    };
    mockElementSize.value = { width: 0, height: 0 };
  });

  it("renders the aggregated error pane when any query has errored", () => {
    setup({
      queries: [
        makeQuery({ id: 101, name: "OK", status: "done" }),
        makeQuery({
          id: 102,
          name: "Boom",
          status: "error",
          error_message: "kaboom",
        }),
      ],
    });

    expect(
      screen.getByText("We couldn't generate one or more of these charts."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("visualization-stub")).not.toBeInTheDocument();
  });

  it("renders one skeleton per query while any query is unsettled", () => {
    setup({
      queries: [
        makeQuery({ id: 101, name: "Q1", status: "done" }),
        makeQuery({ id: 102, name: "Q2", status: "running" }),
      ],
    });

    // Both queries get a skeleton. Each skeleton renders its own
    // `ExplorationVisualizationHeader` — we count the section by group
    // name, present once.
    expect(
      screen.getAllByText("Revenue across regions").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByTestId("visualization-stub")).not.toBeInTheDocument();
  });

  it("renders the combined Visualization with one series per query and graph.split_panels enabled", () => {
    const queries = [
      makeQuery({ id: 101, name: "Revenue (US)", status: "done" }),
      makeQuery({ id: 102, name: "Revenue (EU)", status: "done" }),
    ];
    const datasets = new Map([
      [101, makeDataset()],
      [102, makeDataset()],
    ]);
    setup({ queries, datasets });

    const stub = screen.getByTestId("visualization-stub");
    const rawSeries = JSON.parse(stub.getAttribute("data-raw-series") ?? "[]");

    expect(rawSeries).toHaveLength(2);
    for (const series of rawSeries) {
      expect(series.card.visualization_settings["graph.split_panels"]).toBe(
        true,
      );
    }
    expect(rawSeries.map((s: any) => s.card.id)).toEqual([101, 102]);
    expect(rawSeries.map((s: any) => s.card.name)).toEqual([
      "Revenue (US)",
      "Revenue (EU)",
    ]);
  });

  it("falls back to skeletons when datasets are still loading even though statuses are settled", () => {
    setup({
      queries: [
        makeQuery({ id: 101, name: "Q1", status: "done" }),
        makeQuery({ id: 102, name: "Q2", status: "done" }),
      ],
      // Don't populate datasets → hook reports `currentData = undefined`.
    });

    expect(screen.queryByTestId("visualization-stub")).not.toBeInTheDocument();
  });

  it("renders the empty pane when the group has no queries", () => {
    setup({ queries: [] });

    expect(screen.getByText("No charts in this group.")).toBeInTheDocument();
    expect(screen.queryByTestId("visualization-stub")).not.toBeInTheDocument();
  });

  it("shows the group name in the header", () => {
    const queries = [
      makeQuery({ id: 101, name: "Revenue (US)", status: "done" }),
      makeQuery({ id: 102, name: "Revenue (EU)", status: "done" }),
    ];
    const datasets = new Map([
      [101, makeDataset()],
      [102, makeDataset()],
    ]);
    setup({ queries, datasets });

    // Group name visible in the header chrome.
    const header = screen.getByText("Revenue across regions");
    expect(header).toBeInTheDocument();
    // And NOT individual query names — those are only inside the chart stub.
    expect(
      within(header.parentElement!).queryByText("Revenue (US)"),
    ).not.toBeInTheDocument();
  });

  describe("chunking many queries into multiple split-panels charts", () => {
    /**
     * Helper: build N queries + their datasets, set the chart-card
     * `contentRect.height`, render, and return the rendered chunks'
     * lengths.
     *
     * Cap math (matches the component):
     *   usable = cardHeight − 50 (card internal chrome) − 50 (chunk chrome)
     *   maxPerChunk = max(2, floor(usable / 330))   // 330 = 300 panel + 30 gap
     */
    function setupChunked(queryCount: number, cardHeight: number) {
      mockElementSize.value = { width: 1280, height: cardHeight };
      const queries = Array.from({ length: queryCount }, (_, i) =>
        makeQuery({ id: 100 + i, name: `Q${i + 1}`, status: "done" }),
      );
      const datasets = new Map(queries.map((q) => [q.id, makeDataset()]));
      setup({ queries, datasets });

      const stubs = screen.getAllByTestId("visualization-stub");
      return stubs.map(
        (s) =>
          JSON.parse(s.getAttribute("data-raw-series") ?? "[]")
            .length as number,
      );
    }

    it("renders one chunk when the queries fit under the per-chunk cap", () => {
      // cardHeight=1420 → usable=1320 → cap=floor(1320/330)=4.
      // 4 queries fit in a single chunk.
      const chunks = setupChunked(4, 1420);
      expect(chunks).toEqual([4]);
    });

    it("splits queries across chunks once the cap is exceeded", () => {
      // cardHeight=1090 → usable=990 → cap=floor(990/330)=3.
      // 8 queries → ceil(8/3) = 3 chunks of sizes [3, 3, 2].
      const chunks = setupChunked(8, 1090);
      expect(chunks).toEqual([3, 3, 2]);
    });

    it("never produces single-panel chunks even on a tiny container", () => {
      // cardHeight=200 → usable<0 → cap floors at 2.
      // 5 queries → ceil(5/2) = 3 chunks of sizes [2, 2, 1].
      // The trailing 1-panel chunk is the natural remainder; the floor
      // is on the cap, not on chunk size — leftover queries always get
      // a chunk regardless.
      const chunks = setupChunked(5, 200);
      expect(chunks).toEqual([2, 2, 1]);
    });

    it("falls back to a 4-panel cap before the first measurement lands", () => {
      // cardHeight=0 → fallback cap of 4 kicks in.
      // 8 queries → ceil(8/4) = 2 chunks of sizes [4, 4].
      const chunks = setupChunked(8, 0);
      expect(chunks).toEqual([4, 4]);
    });

    it("keeps graph.split_panels enabled on every chunk's series", () => {
      const chunks = setupChunked(8, 1090);
      expect(chunks).toEqual([3, 3, 2]);
      const stubs = screen.getAllByTestId("visualization-stub");
      for (const stub of stubs) {
        const rawSeries = JSON.parse(
          stub.getAttribute("data-raw-series") ?? "[]",
        );
        for (const s of rawSeries) {
          expect(s.card.visualization_settings["graph.split_panels"]).toBe(
            true,
          );
        }
      }
    });
  });

  describe("non-cartesian displays (e.g. map)", () => {
    beforeEach(() => {
      mockDefaultDisplay.value = {
        display: "map",
        settings: {} as Record<string, unknown>,
      };
    });

    it("renders one Visualization per query (no combined chart) without graph.split_panels", () => {
      const queries = [
        makeQuery({ id: 201, name: "Sessions (US)", status: "done" }),
        makeQuery({ id: 202, name: "Sessions (EU)", status: "done" }),
      ];
      const datasets = new Map([
        [201, makeDataset()],
        [202, makeDataset()],
      ]);
      setup({ queries, datasets });

      // N separate Visualization stubs, one per query.
      const stubs = screen.getAllByTestId("visualization-stub");
      expect(stubs).toHaveLength(2);

      for (const stub of stubs) {
        const rawSeries = JSON.parse(
          stub.getAttribute("data-raw-series") ?? "[]",
        );
        expect(rawSeries).toHaveLength(1);
        // Cartesian-only settings must NOT leak into a map card.
        expect(
          rawSeries[0].card.visualization_settings["graph.split_panels"],
        ).toBeUndefined();
        expect(
          rawSeries[0].card.visualization_settings["graph.dimensions"],
        ).toBeUndefined();
        expect(rawSeries[0].card.display).toBe("map");
      }

      // Each stub's series belongs to a different query (preserving order).
      const seriesByStub = stubs.map(
        (s) => JSON.parse(s.getAttribute("data-raw-series") ?? "[]")[0].card.id,
      );
      expect(seriesByStub).toEqual([201, 202]);
    });

    it("bakes a distinct map.colors ramp into each map card so they don't share a color", () => {
      const queries = [
        makeQuery({ id: 201, name: "Sessions (US)", status: "done" }),
        makeQuery({ id: 202, name: "Sessions (EU)", status: "done" }),
      ];
      const datasets = new Map([
        [201, makeDataset()],
        [202, makeDataset()],
      ]);
      setup({ queries, datasets });

      const stubs = screen.getAllByTestId("visualization-stub");
      const ramps = stubs.map(
        (s) =>
          JSON.parse(s.getAttribute("data-raw-series") ?? "[]")[0].card
            .visualization_settings["map.colors"],
      );

      // Every card has a non-empty color ramp.
      for (const ramp of ramps) {
        expect(Array.isArray(ramp)).toBe(true);
        expect(ramp.length).toBeGreaterThan(0);
      }
      // The two ramps differ — at minimum their first color is not the
      // same hue, since `getColorsForValues` assigned distinct colors
      // to the two query ids.
      expect(ramps[0][0]).not.toEqual(ramps[1][0]);
    });

    it("renders a single shared legend at the top with one item per chart", () => {
      const queries = [
        makeQuery({ id: 201, name: "Sessions (US)", status: "done" }),
        makeQuery({ id: 202, name: "Sessions (EU)", status: "done" }),
      ];
      const datasets = new Map([
        [201, makeDataset()],
        [202, makeDataset()],
      ]);
      setup({ queries, datasets });

      // One legend role, two listitem children — mirrors the
      // auto-generated legend a cartesian `graph.split_panels` chart
      // shows. Both query names are visible inside the legend, and
      // they each appear exactly once (no duplicate per-chart headers).
      const legend = screen.getByRole("list", { name: "Legend" });
      expect(within(legend).getByText("Sessions (US)")).toBeInTheDocument();
      expect(within(legend).getByText("Sessions (EU)")).toBeInTheDocument();
      expect(within(legend).getAllByRole("listitem")).toHaveLength(2);
      expect(screen.getAllByText("Sessions (US)")).toHaveLength(1);
      expect(screen.getAllByText("Sessions (EU)")).toHaveLength(1);
    });
  });
});
