import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import {
  createGroup,
  createQuery,
  createThread,
} from "metabase/explorations/test-utils";
import registerVisualizations from "metabase/visualizations/register";
import type {
  Dataset,
  ExplorationQuery,
  ExplorationQueryType,
  Timeline,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockTimeline,
} from "metabase-types/api/mocks";

import { ExplorationGroupVisualization } from "./ExplorationGroupVisualization";

registerVisualizations();

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

const mockDatasetsByQueryId = new Map<number, Dataset | undefined>();
const mockErrorsByQueryId = new Map<number, unknown>();
jest.mock("metabase/api/exploration", () => ({
  __esModule: true,
  explorationApi: {
    endpoints: {
      getExplorationQueryResult: {
        initiate: () => () => ({ unsubscribe: jest.fn() }),
        select: (id: number) => () => ({
          data: mockDatasetsByQueryId.get(id),
          error: mockErrorsByQueryId.get(id),
          isLoading:
            !mockDatasetsByQueryId.has(id) && !mockErrorsByQueryId.has(id),
        }),
      },
    },
  },
  useAppendChartToDocumentMutation: () => [jest.fn()],
  useCreateExplorationDocumentMutation: () => [jest.fn()],
}));

function makeTimeseriesDataset(): Dataset {
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

function makeCategoricalDataset(): Dataset {
  return createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "category", base_type: "type/Text" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      rows: [
        ["A", 1],
        ["B", 2],
      ],
    }),
  });
}

function makeStateMapDataset(): Dataset {
  return createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockColumn({
          name: "state",
          base_type: "type/Text",
          semantic_type: "type/State",
        }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      rows: [
        ["CA", 10],
        ["NY", 20],
      ],
    }),
  });
}

const thread = createThread();

const group = createGroup({
  id: "auto:1:dim-page",
  display_type: "page",
  name: "Revenue across regions",
  query_ids: [101, 102],
});

interface SetupOpts {
  queries: ExplorationQuery[];
  datasets?: Map<number, Dataset>;
  errors?: Map<number, unknown>;
  availableTimelines?: Timeline[];
  interestingTimelineIds?: ReadonlySet<number>;
}

function setup({
  queries,
  datasets,
  errors,
  availableTimelines = [],
  interestingTimelineIds,
}: SetupOpts) {
  mockDatasetsByQueryId.clear();
  mockErrorsByQueryId.clear();
  if (datasets) {
    for (const [id, ds] of datasets) {
      mockDatasetsByQueryId.set(id, ds);
    }
  }
  if (errors) {
    for (const [id, err] of errors) {
      mockErrorsByQueryId.set(id, err);
    }
  }

  return renderWithProviders(
    <ExplorationGroupVisualization
      explorationId={1}
      group={{ ...group, query_ids: queries.map((q) => q.id) }}
      queries={queries}
      explorationThread={thread}
      availableTimelines={availableTimelines}
      selectedTimelineId={null}
      onSelectTimelineId={jest.fn()}
      interestingTimelineIds={interestingTimelineIds}
      locationSearch="?timeline=1"
    />,
  );
}

describe("ExplorationGroupVisualization", () => {
  afterEach(() => {
    mockDatasetsByQueryId.clear();
    mockErrorsByQueryId.clear();
  });

  it("shows a permission message (not the loading skeleton) when a settled query's result fetch is forbidden", () => {
    setup({
      queries: [
        createQuery({ id: 101, name: "Q1", status: "done" }),
        createQuery({ id: 102, name: "Q2", status: "done" }),
      ],
      // 101 streams fine, 102's cached result is gated by the viewer's data-access lens
      datasets: new Map([[101, makeTimeseriesDataset()]]),
      errors: new Map([[102, { status: 403 }]]),
    });

    expect(
      screen.getByText("You don't have permission to view these results."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("visualization-stub")).not.toBeInTheDocument();
  });

  it("renders the aggregated error pane when any query has errored", () => {
    setup({
      queries: [
        createQuery({ id: 101, name: "OK", status: "done" }),
        createQuery({
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

  it("renders the stopped pane when any query was canceled", () => {
    setup({
      queries: [
        createQuery({ id: 101, name: "OK", status: "done" }),
        createQuery({ id: 102, name: "Stopped", status: "canceled" }),
      ],
    });

    expect(screen.getByText("Research was stopped.")).toBeInTheDocument();
    expect(screen.queryByTestId("visualization-stub")).not.toBeInTheDocument();
  });

  it("renders one skeleton per query while any query is unsettled", () => {
    setup({
      queries: [
        createQuery({ id: 101, name: "Q1", status: "done" }),
        createQuery({ id: 102, name: "Q2", status: "running" }),
      ],
    });

    expect(screen.getAllByText("Q1").length).toBeGreaterThan(0); // we use the first query's name for the header
    expect(screen.queryByTestId("visualization-stub")).not.toBeInTheDocument();
  });

  it("renders the combined Visualization with one series per query and graph.split_panels enabled", () => {
    const queries = [
      createQuery({
        id: 101,
        name: "Revenue (US)",
        status: "done",
        dimension_id: "dim-shared",
      }),
      createQuery({
        id: 102,
        name: "Revenue (EU)",
        status: "done",
        dimension_id: "dim-shared",
      }),
    ];
    const datasets = new Map([
      [101, makeTimeseriesDataset()],
      [102, makeTimeseriesDataset()],
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
        createQuery({ id: 101, name: "Q1", status: "done" }),
        createQuery({ id: 102, name: "Q2", status: "done" }),
      ],
    });

    expect(screen.queryByTestId("visualization-stub")).not.toBeInTheDocument();
  });

  it("renders the empty pane when the group has no queries", () => {
    setup({ queries: [] });

    expect(screen.getByText("No charts in this group.")).toBeInTheDocument();
    expect(screen.queryByTestId("visualization-stub")).not.toBeInTheDocument();
  });

  it("shows the first query's name in the header", () => {
    const queries = [
      createQuery({ id: 101, name: "Revenue (US)", status: "done" }),
      createQuery({ id: 102, name: "Revenue (EU)", status: "done" }),
    ];
    const datasets = new Map([
      [101, makeTimeseriesDataset()],
      [102, makeTimeseriesDataset()],
    ]);
    setup({ queries, datasets });

    expect(screen.getByText("Revenue (US)")).toBeInTheDocument();
  });

  it("shows the timeline dropdown when the group has timeseries charts", async () => {
    const timelines = [
      createMockTimeline({ id: 1, name: "Releases" }),
      createMockTimeline({ id: 2, name: "Incidents" }),
    ];
    setup({
      queries: [
        createQuery({ id: 101, name: "Revenue trend", status: "done" }),
      ],
      datasets: new Map([[101, makeTimeseriesDataset()]]),
      availableTimelines: timelines,
    });

    expect(
      screen.getByRole("textbox", { name: "Select timeline" }),
    ).toBeInTheDocument();
  });

  it("does not show the timeline dropdown for non-timeseries charts", () => {
    setup({
      queries: [
        createQuery({
          id: 201,
          name: "Sessions (US)",
          status: "done",
          dimension_id: "dim-map",
        }),
        createQuery({
          id: 202,
          name: "Sessions (EU)",
          status: "done",
          dimension_id: "dim-map",
        }),
      ],
      datasets: new Map([
        [201, makeStateMapDataset()],
        [202, makeStateMapDataset()],
      ]),
      availableTimelines: [createMockTimeline({ id: 1, name: "Releases" })],
    });

    expect(
      screen.queryByRole("textbox", { name: "Select timeline" }),
    ).not.toBeInTheDocument();
  });

  describe("cartesian combined chart", () => {
    function setupCartesian(queryCount: number) {
      const queries = Array.from({ length: queryCount }, (_, i) =>
        createQuery({
          id: 100 + i,
          name: `Q${i + 1}`,
          status: "done",
          dimension_id: "dim-shared",
        }),
      );
      const datasets = new Map(
        queries.map((q) => [q.id, makeTimeseriesDataset()]),
      );
      setup({ queries, datasets });
      return { queries };
    }

    it("renders a single combined Visualization with one rawSeries entry per query", () => {
      setupCartesian(8);

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
  });

  describe("non-cartesian displays (e.g. map)", () => {
    function setupMapGroup() {
      const queries = [
        createQuery({
          id: 201,
          name: "Sessions (US)",
          status: "done",
          dimension_id: "dim-map",
          segment_id: 1,
          segment_name: "US",
        }),
        createQuery({
          id: 202,
          name: "Sessions (EU)",
          status: "done",
          dimension_id: "dim-map",
          segment_id: 2,
          segment_name: "EU",
        }),
      ];
      const datasets = new Map([
        [201, makeStateMapDataset()],
        [202, makeStateMapDataset()],
      ]);
      setup({ queries, datasets });
      return queries;
    }

    it("renders one Visualization per query (no combined chart) without graph.split_panels", () => {
      setupMapGroup();

      const stubs = screen.getAllByTestId("visualization-stub");
      expect(stubs).toHaveLength(2);

      for (const stub of stubs) {
        const rawSeries = JSON.parse(
          stub.getAttribute("data-raw-series") ?? "[]",
        );
        expect(rawSeries).toHaveLength(1);
        expect(
          rawSeries[0].card.visualization_settings["graph.split_panels"],
        ).toBeUndefined();
        expect(
          rawSeries[0].card.visualization_settings["graph.dimensions"],
        ).toBeUndefined();
        expect(rawSeries[0].card.display).toBe("map");
      }

      const seriesByStub = stubs.map(
        (s) => JSON.parse(s.getAttribute("data-raw-series") ?? "[]")[0].card.id,
      );
      expect(seriesByStub).toEqual([201, 202]);
    });

    it("bakes a distinct map.colors ramp into each map card per segment name", () => {
      setupMapGroup();

      const stubs = screen.getAllByTestId("visualization-stub");
      const ramps = stubs.map(
        (s) =>
          JSON.parse(s.getAttribute("data-raw-series") ?? "[]")[0].card
            .visualization_settings["map.colors"],
      );

      for (const ramp of ramps) {
        expect(Array.isArray(ramp)).toBe(true);
        expect(ramp.length).toBeGreaterThan(0);
      }
      expect(ramps[0][0]).not.toEqual(ramps[1][0]);
    });

    it("renders a single shared legend at the top with one item per segment", () => {
      setupMapGroup();

      const legend = screen.getByRole("list", { name: "Legend" });
      expect(within(legend).getByText("US")).toBeInTheDocument();
      expect(within(legend).getByText("EU")).toBeInTheDocument();
      expect(within(legend).getAllByRole("listitem")).toHaveLength(2);
      expect(screen.getAllByText("US")).toHaveLength(1);
      expect(screen.getAllByText("EU")).toHaveLength(1);
    });
  });

  it("marks interesting timelines passed via interestingTimelineIds", async () => {
    const timelines = [
      createMockTimeline({ id: 10, name: "Releases" }),
      createMockTimeline({ id: 20, name: "Incidents" }),
    ];
    setup({
      queries: [
        createQuery({ id: 101, name: "Revenue trend", status: "done" }),
      ],
      datasets: new Map([[101, makeTimeseriesDataset()]]),
      availableTimelines: timelines,
      interestingTimelineIds: new Set([10]),
    });

    await userEvent.click(
      screen.getByRole("textbox", { name: "Select timeline" }),
    );

    const releasesOption = await screen.findByRole("option", {
      name: /Releases/,
    });
    const incidentsOption = screen.getByRole("option", { name: /Incidents/ });

    expect(
      within(releasesOption).getByTestId("potentially-interesting-marker"),
    ).toBeInTheDocument();
    expect(
      within(incidentsOption).queryByTestId("potentially-interesting-marker"),
    ).not.toBeInTheDocument();
  });

  describe("heatmap display", () => {
    it("renders a single combined table visualization for a segment group", () => {
      const queries = Array.from({ length: 4 }, (_, i) =>
        createQuery({
          id: 301 + i,
          name: "Revenue by Plan",
          status: "done",
          dimension_id: "dim-segment",
          query_type: "default",
          segment_id: i + 1,
        }),
      );
      const datasets = new Map(
        queries.map((q) => [q.id, makeCategoricalDataset()]),
      );
      setup({ queries, datasets });

      const stubs = screen.getAllByTestId("visualization-stub");
      expect(stubs).toHaveLength(1);

      const rawSeries = JSON.parse(
        stubs[0].getAttribute("data-raw-series") ?? "[]",
      );
      expect(rawSeries).toHaveLength(1);
      expect(rawSeries[0].card.display).toBe("table");
      expect(rawSeries[0].card.visualization_settings["table.pivot"]).toBe(
        true,
      );
    });
  });

  describe("chart layout grid", () => {
    function setupGroupLayout(
      queries: ExplorationQuery[],
      datasets?: Map<number, Dataset>,
    ) {
      const datasetMap =
        datasets ??
        new Map(queries.map((q) => [q.id, makeTimeseriesDataset()]));
      return setup({ queries, datasets: datasetMap });
    }

    function lineQuery(
      id: number,
      name: string,
      queryType: ExplorationQueryType = "default",
    ): ExplorationQuery {
      return createQuery({
        id,
        name,
        status: "done",
        dimension_id: `dim-${id}`,
        query_type: queryType,
      });
    }

    function tableGroupQueries(
      queryType: ExplorationQueryType,
      name: string,
      startId: number,
    ): ExplorationQuery[] {
      return Array.from({ length: 4 }, (_, i) =>
        createQuery({
          id: startId + i,
          name,
          status: "done",
          dimension_id: `dim-${queryType}`,
          query_type: queryType,
          segment_id: i + 1,
        }),
      );
    }

    function datasetsForMixedLayout(
      timeseriesQueryId: number,
      tableQueryIds: number[],
    ): Map<number, Dataset> {
      const datasets = new Map<number, Dataset>([
        [timeseriesQueryId, makeTimeseriesDataset()],
      ]);
      for (const id of tableQueryIds) {
        datasets.set(id, makeCategoricalDataset());
      }
      return datasets;
    }

    it('uses the "two-small-charts-down" layout for the day-of-week + hour-of-day trio', () => {
      setupGroupLayout([
        lineQuery(101, "Revenue trend"),
        lineQuery(102, "Revenue (day of week)", "temporal-pattern-day"),
        lineQuery(103, "Revenue (hour of day)", "temporal-pattern-hour"),
      ]);

      expect(screen.getByTestId("exploration-chart-grid")).toHaveAttribute(
        "data-chart-layout",
        "two-small-charts-down",
      );
    });

    it('uses the "default" layout for an ordinary multi-chart group', () => {
      setupGroupLayout([
        lineQuery(101, "Revenue (US)"),
        lineQuery(102, "Revenue (EU)"),
      ]);

      expect(screen.getByTestId("exploration-chart-grid")).toHaveAttribute(
        "data-chart-layout",
        "default",
      );
    });

    it('uses the "default" layout for a 3-chart group whose names do not match', () => {
      setupGroupLayout([
        lineQuery(101, "Revenue trend"),
        lineQuery(102, "Revenue by region"),
        lineQuery(103, "Revenue by plan"),
      ]);

      expect(screen.getByTestId("exploration-chart-grid")).toHaveAttribute(
        "data-chart-layout",
        "default",
      );
    });

    it('uses the "two-same-size-charts-vertically" layout for a 2-chart group with a `time-facet` secondary', () => {
      setupGroupLayout([
        lineQuery(101, "Revenue by region"),
        lineQuery(102, "Revenue over time", "time-facet"),
      ]);

      expect(screen.getByTestId("exploration-chart-grid")).toHaveAttribute(
        "data-chart-layout",
        "two-same-size-charts-vertically",
      );
    });

    it('shows a "Top {k}" label on the bottom chart when its queryType is "top-n-other"', () => {
      setupGroupLayout([
        lineQuery(101, "Revenue by amount"),
        createQuery({
          id: 102,
          name: "Top 3 amounts",
          status: "done",
          dimension_id: "dim-102",
          query_type: "top-n-other",
          params: { k: 3 },
        }),
      ]);

      expect(screen.getByText("Top 3")).toBeInTheDocument();
    });

    it('uses the "chart-and-table-vertically" layout when a 2-chart pair has a special table secondary', () => {
      const tableQueries = tableGroupQueries("top-n-other", "Top revenue", 10);
      setupGroupLayout(
        [lineQuery(1, "Revenue by amount"), ...tableQueries],
        datasetsForMixedLayout(
          1,
          tableQueries.map((q) => q.id),
        ),
      );

      expect(screen.getByTestId("exploration-chart-grid")).toHaveAttribute(
        "data-chart-layout",
        "chart-and-table-vertically",
      );
    });

    it('uses the "two-small-tables-down" layout when the two bottom charts are heat-map tables', () => {
      const dayQueries = tableGroupQueries(
        "temporal-pattern-day",
        "Orders (day of week)",
        10,
      );
      const hourQueries = tableGroupQueries(
        "temporal-pattern-hour",
        "Orders (hour of day)",
        20,
      );
      setupGroupLayout(
        [lineQuery(1, "Orders trend"), ...dayQueries, ...hourQueries],
        datasetsForMixedLayout(1, [
          ...dayQueries.map((q) => q.id),
          ...hourQueries.map((q) => q.id),
        ]),
      );

      expect(screen.getByTestId("exploration-chart-grid")).toHaveAttribute(
        "data-chart-layout",
        "two-small-tables-down",
      );
    });
  });
});
