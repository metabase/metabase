import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type { GoalSegment, RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockFailedReferencedEntitiesResults,
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

function setup(segments: GoalSegment[], { isQueryBuilder = false } = {}) {
  const series: RawSeries = [
    createMockSingleSeries(
      createMockCard({
        display: "gauge",
        visualization_settings: { "gauge.segments": segments },
      }),
      {
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "count", base_type: "type/Integer" }),
          ],
          rows: [[50]],
          referenced_entities: createMockFailedReferencedEntitiesResults({
            error: "boom",
          }),
        }),
      },
    ),
  ];

  renderWithProviders(
    <Visualization rawSeries={series} isQueryBuilder={isQueryBuilder} />,
  );
}

const SEGMENTS: GoalSegment[] = [
  { min: 0, max: 50, color: "red" },
  { min: 50, max: GOAL_REF, color: "yellow" },
  { min: GOAL_REF, max: 100, color: "green" },
];

describe("gauge dynamic goal", () => {
  it("renders the ranges that resolve with one warning for consecutive failed bounds in the query builder", async () => {
    setup(SEGMENTS, { isQueryBuilder: true });

    expect(await screen.findByTestId("gauge-arc-0")).toBeInTheDocument();
    expect(screen.queryByTestId("gauge-arc-1")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Goal warning")).toHaveLength(1);
    // like an unset bound, a failed one drops its range from the arc
    expect(screen.queryByText("100")).not.toBeInTheDocument();

    await userEvent.hover(screen.getByLabelText("Goal warning"));
    expect(
      await screen.findByText("Couldn't get some color range values"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("boom")).toHaveLength(2);
  });

  it("lists only its own range's errors in each warning", async () => {
    setup(
      [
        { min: 0, max: 10, color: "red" },
        { min: GOAL_REF, max: 75, color: "yellow" },
        { min: 75, max: GOAL_REF, color: "green" },
        { min: 80, max: 100, color: "blue" },
      ],
      { isQueryBuilder: true },
    );

    const [warning] = await screen.findAllByLabelText("Goal warning");
    expect(screen.getAllByLabelText("Goal warning")).toHaveLength(2);

    await userEvent.hover(warning);
    expect(await screen.findAllByRole("listitem")).toHaveLength(1);
  });

  it("renders the ranges that resolve without a warning outside the query builder", async () => {
    setup(SEGMENTS);

    expect(await screen.findByTestId("gauge-arc-0")).toBeInTheDocument();
    expect(screen.queryByLabelText("Goal warning")).not.toBeInTheDocument();
  });
});
