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

// Stub `StickyXAxisChart` to keep echarts out of the test bundle.
jest.mock("./StickyXAxisChart", () => ({
  __esModule: true,
  StickyXAxisChart: () => <div data-testid="sticky-x-axis-stub" />,
}));

// Mock `useElementSize` so the cartesian body's container measurement
// is deterministic in JSDOM (which has no real ResizeObserver). The
// default value is "small enough that the main chart overflows", so
// the sticky axis renders; individual tests override
// `mockScrollContainerHeight.value` to flip the overflow decision.
const mockScrollContainerHeight = { value: 400 };
jest.mock("@mantine/hooks", () => {
  const actual = jest.requireActual("@mantine/hooks");
  return {
    ...actual,
    useElementSize: () => ({
      ref: () => undefined,
      width: 800,
      height: mockScrollContainerHeight.value,
    }),
  };
});

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
    dimension_name: "Dim 1",
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
    mockScrollContainerHeight.value = 400;
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

  describe("cartesian combined chart with sticky x-axis", () => {
    /**
     * Helper: build N queries + their datasets, render, and return
     * the rendered `<Visualization>` and `<StickyXAxisChart>` stubs.
     */
    function setupCartesian(queryCount: number) {
      const queries = Array.from({ length: queryCount }, (_, i) =>
        makeQuery({ id: 100 + i, name: `Q${i + 1}`, status: "done" }),
      );
      const datasets = new Map(queries.map((q) => [q.id, makeDataset()]));
      setup({ queries, datasets });
      return { queries };
    }

    it("renders a single combined Visualization with one rawSeries entry per query", () => {
      setupCartesian(8);

      // Exactly one Visualization stub, regardless of how many
      // queries are in the group — chunking is gone.
      const stubs = screen.getAllByTestId("visualization-stub");
      expect(stubs).toHaveLength(1);

      const rawSeries = JSON.parse(
        stubs[0].getAttribute("data-raw-series") ?? "[]",
      );
      expect(rawSeries).toHaveLength(8);
      expect(rawSeries.map((s: any) => s.card.id)).toEqual([
        100, 101, 102, 103, 104, 105, 106, 107,
      ]);
      for (const s of rawSeries) {
        expect(s.card.visualization_settings["graph.split_panels"]).toBe(true);
      }
    });

    it("renders a sticky x-axis chart alongside the combined chart when the chart overflows the container", () => {
      // Default `mockScrollContainerHeight.value` (400) is much
      // smaller than the natural main-chart height (5 panels × 300px
      // = 1500px), so the chart overflows and the sticky axis is
      // needed.
      setupCartesian(5);

      // The sticky x-axis stub is rendered as a sibling of the main
      // combined chart.
      expect(screen.getByTestId("sticky-x-axis-stub")).toBeInTheDocument();
      // Exactly one main Visualization (no chunking).
      expect(screen.getAllByTestId("visualization-stub")).toHaveLength(1);
    });

    it("does NOT render the sticky x-axis chart when the chart fits in the container", () => {
      // Make the scroll container larger than the natural main-chart
      // height (2 panels × 300px = 600px) so the chart fits and the
      // main chart's own bottom x-axis is on-screen — no need for a
      // duplicate sticky copy.
      mockScrollContainerHeight.value = 2000;
      setupCartesian(2);

      expect(
        screen.queryByTestId("sticky-x-axis-stub"),
      ).not.toBeInTheDocument();
      expect(screen.getAllByTestId("visualization-stub")).toHaveLength(1);
    });

    it("hides the main chart's bottom x-axis (via vis-settings) when the sticky axis is shown", () => {
      // Sticky on → main chart should have `graph.x_axis.axis_enabled`
      // and `graph.x_axis.labels_enabled` forced off, so we don't
      // render the axis twice.
      setupCartesian(5);

      const stub = screen.getByTestId("visualization-stub");
      const rawSeries = JSON.parse(
        stub.getAttribute("data-raw-series") ?? "[]",
      );
      for (const s of rawSeries) {
        expect(s.card.visualization_settings["graph.x_axis.axis_enabled"]).toBe(
          false,
        );
        expect(
          s.card.visualization_settings["graph.x_axis.labels_enabled"],
        ).toBe(false);
      }
    });

    it("keeps the main chart's bottom x-axis enabled when the sticky axis is hidden", () => {
      // Sticky off → main chart keeps its own bottom x-axis, so the
      // axis settings should NOT be force-disabled.
      mockScrollContainerHeight.value = 2000;
      setupCartesian(2);

      const stub = screen.getByTestId("visualization-stub");
      const rawSeries = JSON.parse(
        stub.getAttribute("data-raw-series") ?? "[]",
      );
      for (const s of rawSeries) {
        // We don't force-set the axis-enabled flags when the sticky
        // is off — they should be absent from the per-card override
        // (and therefore fall through to the cartesian builder's
        // defaults, which keep the axis visible).
        expect(
          s.card.visualization_settings["graph.x_axis.axis_enabled"],
        ).toBeUndefined();
        expect(
          s.card.visualization_settings["graph.x_axis.labels_enabled"],
        ).toBeUndefined();
      }
    });

    it("does not render the sticky x-axis chart for non-cartesian displays", () => {
      mockDefaultDisplay.value = {
        display: "map",
        settings: {} as Record<string, unknown>,
      };
      setupCartesian(3);

      // Map mode renders N independent Visualizations, no sticky axis.
      expect(
        screen.queryByTestId("sticky-x-axis-stub"),
      ).not.toBeInTheDocument();
      expect(screen.getAllByTestId("visualization-stub")).toHaveLength(3);
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
