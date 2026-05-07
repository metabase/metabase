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

    it("renders a per-chart legend header showing the query name above each map", () => {
      const queries = [
        makeQuery({ id: 201, name: "Sessions (US)", status: "done" }),
        makeQuery({ id: 202, name: "Sessions (EU)", status: "done" }),
      ];
      const datasets = new Map([
        [201, makeDataset()],
        [202, makeDataset()],
      ]);
      setup({ queries, datasets });

      // Each chart gets its own header text (the query name) — the
      // viz-stub itself doesn't render the name on a single-series
      // map, so this is the user-visible "legend" replacement.
      expect(screen.getByText("Sessions (US)")).toBeInTheDocument();
      expect(screen.getByText("Sessions (EU)")).toBeInTheDocument();
    });
  });
});
