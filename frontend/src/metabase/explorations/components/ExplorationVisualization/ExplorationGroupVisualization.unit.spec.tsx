import userEvent from "@testing-library/user-event";

import { fireEvent, renderWithProviders, screen, within } from "__support__/ui";
import { createPage, createQuery } from "metabase/explorations/test-utils";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import type { ClickObject } from "metabase/visualizations/types";
import type {
  Comment,
  Dataset,
  ExplorationBlockNodeType,
  ExplorationPageNode,
  ExplorationQuery,
  HydratedExplorationExploreFilter,
  Timeline,
  TimelineEvent,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";
import { createMockComment } from "metabase-types/api/mocks/comment";

import { ExplorationGroupVisualization } from "./ExplorationGroupVisualization";

registerVisualizations();

jest.mock("metabase/comments/hooks/use-unresolved-comments-count", () => ({
  useUnresolvedCommentsCount: () => 0,
}));

const sampleClickObject: ClickObject = {
  value: 10,
  column: createMockColumn({ name: "count", source: "aggregation" }),
  dimensions: [
    {
      column: createMockColumn({
        name: "category",
        source: "breakout",
        field_ref: ["field", 1, null],
      }),
      value: "Gadget",
    },
  ],
  settings: {},
  cardId: 101,
};

let mockComments: Comment[] = [
  createMockComment({ id: 1, context: { timeline_id: 42 } }),
];
let lastVisualizationProps: Record<string, unknown> | undefined;

// The real `Visualization` is heavy and pulls ECharts; we only care that
// it receives the right props from explorations.
jest.mock("metabase/visualizations/components/Visualization", () => {
  const Visualization = (props: any) => {
    lastVisualizationProps = props;
    const actionNames =
      props.mode
        ?.actionsForClick?.(sampleClickObject)
        ?.map((action: { name: string }) => action.name) ?? [];
    return (
      <div
        data-testid="visualization-stub"
        data-raw-series={JSON.stringify(props.rawSeries)}
        data-action-names={actionNames.join(",")}
        data-highlighted={JSON.stringify(props.highlighted ?? null)}
        data-has-on-change-card-and-run={
          props.onChangeCardAndRun ? "true" : "false"
        }
      />
    );
  };
  return { __esModule: true, default: Visualization };
});

jest.mock("metabase/comments/components/Comments", () => ({
  Comments: ({
    renderExtra,
    disableAutoFocus,
  }: {
    renderExtra?: (comment: Comment) => React.ReactNode;
    disableAutoFocus?: boolean;
  }) => (
    <div
      data-testid="comments-stub"
      data-disable-autofocus={disableAutoFocus ? "true" : "false"}
    >
      {mockComments.map((comment) => (
        <div key={comment.id}>{renderExtra?.(comment)}</div>
      ))}
    </div>
  ),
}));

const mockDatasetsByQueryId = new Map<number, Dataset | undefined>();
const mockErrorsByQueryId = new Map<number, unknown>();
const mockMutationTrigger = () => jest.fn(() => ({ unwrap: jest.fn() }));
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
  useSetPageStarredMutation: () => [mockMutationTrigger()],
  useSetPagesHiddenMutation: () => [mockMutationTrigger()],
  useExploreFurtherMutation: () => [mockMutationTrigger()],
}));

jest.mock("metabase/api/comment", () => ({
  useCreateCommentMutation: () => [mockMutationTrigger()],
}));

function makeTimeseriesDataset(): Dataset {
  return createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "ts", base_type: "type/DateTime" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      // Need more than MIN_ROWS_TO_SHOW_LINE_OR_BAR (3) to avoid row fallback.
      rows: [
        ["2025-01-01", 1],
        ["2025-02-01", 2],
        ["2025-03-01", 3],
        ["2025-04-01", 4],
      ],
    }),
  });
}

function makeSmallTimeseriesDataset(): Dataset {
  return createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "ts", base_type: "type/DateTime" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      rows: [["2025-01-01", 1]],
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

const page = createPage({
  id: 1,
  name: "Revenue across regions",
  query_ids: [101, 102],
});

interface SetupOpts {
  queries: ExplorationQuery[];
  datasets?: Map<number, Dataset>;
  errors?: Map<number, unknown>;
  availableTimelines?: Timeline[];
  selectedTimelineId?: number | null;
  timelineEvents?: TimelineEvent[];
  onSelectTimelineId?: (timelineId: number | null) => void;
  isCommentsSidebarOpen?: boolean;
  wasCommentsSidebarOpen?: boolean;
  blockType?: ExplorationBlockNodeType;
  page?: ExplorationPageNode;
  exploreFilters?: HydratedExplorationExploreFilter[] | null;
}

function setup({
  queries,
  datasets,
  errors,
  availableTimelines = [],
  selectedTimelineId = null,
  timelineEvents = [],
  onSelectTimelineId = jest.fn(),
  isCommentsSidebarOpen = false,
  wasCommentsSidebarOpen = false,
  blockType = "metric",
  page: pageOverride,
  exploreFilters,
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
    <Route
      path="*"
      component={() => (
        <ExplorationGroupVisualization
          explorationId={1}
          page={{
            ...(pageOverride ?? page),
            query_ids: queries.map((q) => q.id),
          }}
          queries={queries}
          blockType={blockType}
          exploreFilters={exploreFilters}
          availableTimelines={availableTimelines}
          selectedTimelineId={selectedTimelineId}
          onSelectTimelineId={onSelectTimelineId}
          timelineEvents={timelineEvents}
          commentDrafts={{}}
          setCommentDrafts={jest.fn()}
          isCommentsSidebarOpen={isCommentsSidebarOpen}
          wasCommentsSidebarOpen={wasCommentsSidebarOpen}
        />
      )}
    />,
    { withRouter: true, initialRoute: "/exploration/1" },
  );
}

function expectCartesianRawSeries(queryCount: number) {
  const stubs = screen.getAllByTestId("visualization-stub");
  expect(stubs).toHaveLength(1);

  const rawSeries = JSON.parse(
    stubs[0].getAttribute("data-raw-series") ?? "[]",
  );
  expect(rawSeries).toHaveLength(queryCount);
  for (const s of rawSeries) {
    expect(s.card.visualization_settings["graph.split_panels"]).toBe(true);
  }
  return rawSeries;
}

describe("ExplorationGroupVisualization", () => {
  beforeEach(() => {
    mockComments = [createMockComment({ id: 1, context: { timeline_id: 42 } })];
    lastVisualizationProps = undefined;
  });

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

  it("shows a loading skeleton (not the chart) while any query is unsettled", () => {
    setup({
      queries: [
        createQuery({ id: 101, name: "Q1", status: "done" }),
        createQuery({ id: 102, name: "Q2", status: "running" }),
      ],
    });

    expect(
      screen.getAllByText("Revenue across regions").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByTestId("visualization-stub")).not.toBeInTheDocument();
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

  it("prefers long_name over name in the header", () => {
    const queries = [
      createQuery({ id: 101, name: "Revenue (US)", status: "done" }),
    ];
    setup({
      queries,
      datasets: new Map([[101, makeTimeseriesDataset()]]),
      page: createPage({
        id: 1,
        name: "Category",
        long_name: "Revenue by Category",
        query_ids: [101],
      }),
    });

    expect(screen.getByText("Revenue by Category")).toBeInTheDocument();
    expect(screen.queryByText("Category")).not.toBeInTheDocument();
  });

  it("renders read-only explore filter pills beneath the header", () => {
    setup({
      queries: [createQuery({ id: 101, name: "Revenue (US)", status: "done" })],
      datasets: new Map([[101, makeTimeseriesDataset()]]),
      exploreFilters: [
        {
          field_ref: ["field", 1, null],
          value: "TX",
          display_value: "TX",
          dimension_name: "State",
        },
      ],
    });

    expect(screen.getByTestId("filter-pill")).toHaveTextContent("State: TX");
  });

  it("shows the group name in the header", () => {
    const queries = [
      createQuery({ id: 101, name: "Revenue (US)", status: "done" }),
      createQuery({ id: 102, name: "Revenue (EU)", status: "done" }),
    ];
    const datasets = new Map([
      [101, makeTimeseriesDataset()],
      [102, makeTimeseriesDataset()],
    ]);
    setup({ queries, datasets });

    expect(screen.getByText("Revenue across regions")).toBeInTheDocument();
  });

  it("shows the timeline dropdown when the group has timeseries charts", () => {
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
      screen.getByRole("button", { name: "Select timeline" }),
    ).toBeInTheDocument();
  });

  it("passes selected timeline events to Visualization for timeseries charts", () => {
    const releasesEvent = createMockTimelineEvent({
      id: 10,
      name: "Releases event",
      timeline_id: 42,
    });
    setup({
      queries: [
        createQuery({ id: 101, name: "Revenue trend", status: "done" }),
      ],
      datasets: new Map([[101, makeTimeseriesDataset()]]),
      availableTimelines: [
        createMockTimeline({
          id: 42,
          name: "Releases",
          events: [releasesEvent],
        }),
      ],
      selectedTimelineId: 42,
      timelineEvents: [releasesEvent],
    });

    expect(lastVisualizationProps?.timelineEvents).toEqual([releasesEvent]);
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
      screen.queryByRole("button", { name: "Select timeline" }),
    ).not.toBeInTheDocument();
  });

  it("does not show the timeline dropdown when a timeseries group falls back to row charts", () => {
    setup({
      queries: [
        createQuery({ id: 101, name: "Revenue trend", status: "done" }),
      ],
      datasets: new Map([[101, makeSmallTimeseriesDataset()]]),
      availableTimelines: [createMockTimeline({ id: 1, name: "Releases" })],
    });

    const rawSeries = JSON.parse(
      screen
        .getByTestId("visualization-stub")
        .getAttribute("data-raw-series") ?? "[]",
    );
    expect(rawSeries[0].card.display).toBe("row");

    expect(
      screen.queryByRole("button", { name: "Select timeline" }),
    ).not.toBeInTheDocument();
  });

  describe("comments sidebar", () => {
    const timeseriesSetup = {
      queries: [
        createQuery({ id: 101, name: "Revenue trend", status: "done" }),
      ],
      datasets: new Map([[101, makeTimeseriesDataset()]]),
      availableTimelines: [createMockTimeline({ id: 42, name: "Releases" })],
    };

    it("renders Comments when the sidebar is open", () => {
      setup({ ...timeseriesSetup, isCommentsSidebarOpen: true });

      expect(screen.getByTestId("comments-stub")).toBeInTheDocument();
    });

    it("does not render Comments when the sidebar is closed", () => {
      setup(timeseriesSetup);

      expect(screen.queryByTestId("comments-stub")).not.toBeInTheDocument();
    });

    it("passes disableAutoFocus when the sidebar was already open", () => {
      setup({
        ...timeseriesSetup,
        isCommentsSidebarOpen: true,
        wasCommentsSidebarOpen: true,
      });

      expect(screen.getByTestId("comments-stub")).toHaveAttribute(
        "data-disable-autofocus",
        "true",
      );
    });

    it("calls onSelectTimelineId when a comment timeline badge is clicked", async () => {
      const onSelectTimelineId = jest.fn();
      setup({
        ...timeseriesSetup,
        isCommentsSidebarOpen: true,
        onSelectTimelineId,
      });

      await userEvent.click(screen.getByRole("button", { name: "Releases" }));

      expect(onSelectTimelineId).toHaveBeenCalledWith(42);
    });

    it("renders filter and timeline badges together", () => {
      mockComments = [
        createMockComment({
          id: 1,
          context: {
            timeline_id: 42,
            highlighted: {
              cardId: 101,
              columnName: "count",
              dimensions: [{ columnName: "ts", value: "2025-01-01" }],
            },
          },
        }),
      ];

      setup({
        ...timeseriesSetup,
        isCommentsSidebarOpen: true,
      });

      expect(
        screen.getByRole("button", { name: "Releases" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Jan/ })).toBeInTheDocument();
    });

    it("sets highlighted on the visualization when hovering the filter badge", async () => {
      mockComments = [
        createMockComment({
          id: 1,
          context: {
            highlighted: {
              cardId: 101,
              columnName: "count",
              dimensions: [{ columnName: "ts", value: "2025-01-01" }],
            },
          },
        }),
      ];

      setup({
        ...timeseriesSetup,
        isCommentsSidebarOpen: true,
      });

      const filterBadge = screen.getByRole("button", { name: /Jan/ });
      fireEvent.mouseEnter(filterBadge);

      expect(screen.getByTestId("visualization-stub")).toHaveAttribute(
        "data-highlighted",
        JSON.stringify({
          cardId: 101,
          columnName: "count",
          dimensions: [{ columnName: "ts", value: "2025-01-01" }],
        }),
      );

      fireEvent.mouseLeave(filterBadge);
      expect(screen.getByTestId("visualization-stub")).toHaveAttribute(
        "data-highlighted",
        "null",
      );
    });
  });

  describe("click actions wiring", () => {
    const timeseriesSetup = {
      queries: [
        createQuery({ id: 101, name: "Revenue trend", status: "done" }),
      ],
      datasets: new Map([[101, makeTimeseriesDataset()]]),
    };

    it("passes mode, highlighted, and onChangeCardAndRun to Visualization", () => {
      setup(timeseriesSetup);

      const stub = screen.getByTestId("visualization-stub");
      expect(stub).toHaveAttribute("data-has-on-change-card-and-run", "true");
      expect(lastVisualizationProps?.mode).toBeDefined();
      expect(lastVisualizationProps?.highlighted).toBeNull();
    });

    it("includes explore further for eligible metric blocks", () => {
      setup({ ...timeseriesSetup, blockType: "metric" });

      expect(screen.getByTestId("visualization-stub")).toHaveAttribute(
        "data-action-names",
        "explore-further,add-comment",
      );
    });

    it("omits explore further for ineligible dimension blocks", () => {
      setup({ ...timeseriesSetup, blockType: "dimension" });

      expect(screen.getByTestId("visualization-stub")).toHaveAttribute(
        "data-action-names",
        "add-comment",
      );
    });
  });

  describe("cartesian combined chart", () => {
    function setupCartesian(
      queryCount: number,
      options?: { names?: string[] },
    ) {
      const queries = Array.from({ length: queryCount }, (_, i) =>
        createQuery({
          id: 100 + i,
          name: options?.names?.[i] ?? `Q${i + 1}`,
          status: "done",
          dimension_id: "dim-shared",
        }),
      );
      const datasets = new Map(
        queries.map((q) => [q.id, makeTimeseriesDataset()]),
      );
      setup({ queries, datasets });
    }

    it("renders one combined Visualization with one rawSeries entry per query", () => {
      setupCartesian(2, {
        names: ["Revenue (US)", "Revenue (EU)"],
      });

      const rawSeries = expectCartesianRawSeries(2);
      expect(
        rawSeries.map((s: { card: { name: string } }) => s.card.name),
      ).toEqual(["Revenue (US)", "Revenue (EU)"]);
    });

    it("keeps split panels enabled for up to 8 queries", () => {
      setupCartesian(8);
      expectCartesianRawSeries(8);
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
});
