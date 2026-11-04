import userEvent from "@testing-library/user-event";

import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type {
  GoalSegment,
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

// Chart components are loaded on demand. Register the gauge up front so each
// test renders in one pass and can be run on its own.
beforeAll(() => loadVisualizationComponents(["gauge"]));

// jsdom doesn't lay out SVG, but the gauge measures its center label
beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 10, height: 10 }),
  });
});

afterAll(() => {
  Reflect.deleteProperty(SVGElement.prototype, "getBBox");
});

const GOAL_REF = { type: "card", id: 9, column: "goal" } as const;

type SetupOpts = {
  columnSettings?: VisualizationSettings["column_settings"];
  height?: number;
  isQueryBuilder?: boolean;
  referencedEntities?: ReferencedEntitiesResults;
  rows?: RowValues[];
  segments: GoalSegment[];
  width?: number;
};

function setup({
  columnSettings,
  height,
  isQueryBuilder = false,
  referencedEntities = createMockFailedReferencedEntitiesResults({
    error: "boom",
  }),
  rows = [[50]],
  segments,
  width,
}: SetupOpts) {
  const series: RawSeries = [
    createMockSingleSeries(
      createMockCard({
        display: "gauge",
        visualization_settings: {
          column_settings: columnSettings,
          "gauge.segments": segments,
        },
      }),
      {
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "count", base_type: "type/Integer" }),
          ],
          rows,
          referenced_entities: referencedEntities,
        }),
      },
    ),
  ];

  const onOpenChartSettings = jest.fn();

  renderWithProviders(
    <Visualization
      height={height}
      isQueryBuilder={isQueryBuilder}
      rawSeries={series}
      width={width}
      onOpenChartSettings={onOpenChartSettings}
    />,
  );

  return { onOpenChartSettings };
}

const SEGMENTS: GoalSegment[] = [
  { min: 0, max: 50, color: "red" },
  { min: 50, max: GOAL_REF, color: "yellow" },
  { min: GOAL_REF, max: 100, color: "green" },
];

const SELF_COLUMN_SEGMENTS: GoalSegment[] = [
  { min: 0, max: 50, color: "red" },
  { min: 50, max: "count", color: "green" },
];

const LABELED_GAUGE_SIZE = 600;
const UNLABELED_GAUGE_SIZE = 200;

const CURRENCY_COLUMN_SETTINGS = { '["name","count"]': { prefix: "$" } };

describe("gauge dynamic goal", () => {
  it("formats a resolved bound's label with this chart's column settings", async () => {
    setup({
      columnSettings: CURRENCY_COLUMN_SETTINGS,
      height: LABELED_GAUGE_SIZE,
      referencedEntities: createMockReferencedEntitiesResults({ value: 2500 }),
      segments: [{ min: 0, max: GOAL_REF, color: "red" }],
      width: LABELED_GAUGE_SIZE,
    });

    expect((await screen.findAllByText("$2,500")).length).toBeGreaterThan(0);
  });

  it("draws a range bounded by an answered value of 0 and a negative decimal one", async () => {
    setup({
      height: LABELED_GAUGE_SIZE,
      referencedEntities: {
        card: {
          9: {
            status: "completed",
            data: {
              cols: [
                createMockColumn({ name: "low" }),
                createMockColumn({ name: "zero" }),
              ],
              rows: [[-12.5, 0]],
            },
          },
        },
      },
      segments: [
        {
          min: { type: "card", id: 9, column: "low" },
          max: { type: "card", id: 9, column: "zero" },
          color: "red",
        },
        { min: 0, max: 100, color: "green" },
      ],
      width: LABELED_GAUGE_SIZE,
    });

    expect(await screen.findByTestId("gauge-arc-0")).toBeInTheDocument();
    expect(screen.getByTestId("gauge-arc-1")).toBeInTheDocument();
    expect(screen.getAllByText("-12.5").length).toBeGreaterThan(0);
  });

  it("formats a resolved bound in the tooltip of a gauge too small for labels", async () => {
    setup({
      columnSettings: CURRENCY_COLUMN_SETTINGS,
      height: UNLABELED_GAUGE_SIZE,
      referencedEntities: createMockReferencedEntitiesResults({ value: 2500 }),
      segments: [{ min: 0, max: GOAL_REF, color: "red", label: "Target" }],
      width: UNLABELED_GAUGE_SIZE,
    });

    fireEvent.mouseMove(await screen.findByTestId("gauge-arc-0"));

    expect(await screen.findByText("$0 - $2,500")).toBeInTheDocument();
    expect(screen.getByText(/Target/)).toBeInTheDocument();
  });

  it("renders the ranges that resolve with one warning for consecutive failed bounds in the query builder", async () => {
    const { onOpenChartSettings } = setup({
      height: LABELED_GAUGE_SIZE,
      isQueryBuilder: true,
      segments: SEGMENTS,
      width: LABELED_GAUGE_SIZE,
    });

    expect(await screen.findByTestId("gauge-arc-0")).toBeInTheDocument();
    expect(screen.queryByTestId("gauge-arc-1")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Goal warning")).toHaveLength(1);
    // like an unset bound, a failed one drops its range from the arc
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.queryByText("100")).not.toBeInTheDocument();

    await userEvent.hover(screen.getByLabelText("Goal warning"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Couldn't get some color range values. Click to open settings.",
    );

    await userEvent.click(screen.getByLabelText("Goal warning"));
    expect(onOpenChartSettings).toHaveBeenCalledWith({
      initialChartSettings: { section: "Ranges" },
    });
  });

  it("renders a warning for each separate run of failed bounds", async () => {
    setup({
      isQueryBuilder: true,
      segments: [
        { min: 0, max: 10, color: "red" },
        { min: GOAL_REF, max: 75, color: "yellow" },
        { min: 75, max: GOAL_REF, color: "green" },
        { min: 80, max: 100, color: "blue" },
      ],
    });

    expect(await screen.findAllByLabelText("Goal warning")).toHaveLength(2);
  });

  it("renders a warning in the query builder when a self-column bound's cell is null", async () => {
    setup({
      isQueryBuilder: true,
      rows: [[null]],
      segments: SELF_COLUMN_SEGMENTS,
    });

    expect(await screen.findByLabelText("Goal warning")).toBeInTheDocument();
  });

  it("renders a warning in the query builder when a self-column bound's question returned no rows", async () => {
    setup({
      isQueryBuilder: true,
      rows: [],
      segments: SELF_COLUMN_SEGMENTS,
    });

    expect(await screen.findByLabelText("Goal warning")).toBeInTheDocument();
  });

  it("renders the ranges that resolve without a warning outside the query builder (metabase#85062)", async () => {
    setup({ segments: SEGMENTS });

    expect(await screen.findByTestId("gauge-arc-0")).toBeInTheDocument();
    expect(screen.queryByLabelText("Goal warning")).not.toBeInTheDocument();
  });
});
