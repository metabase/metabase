import type { ComponentProps } from "react";

import { render, screen } from "__support__/ui";
import type { Series } from "metabase-types/api";
import { createMockCard, createMockColumn } from "metabase-types/api/mocks";

import { Progress } from "./Progress";

const series = (value: number | null = 18760) =>
  [
    {
      card: createMockCard({ display: "progress" }),
      data: {
        rows: [[value]],
        cols: [createMockColumn({ name: "count", base_type: "type/Integer" })],
      },
    },
  ] as Series;

const mockedProps = {} as ComponentProps<typeof Progress>;

const settings = {
  "progress.goal": 0,
  "progress.color": "#84BB4C",
  column: () => ({ column: { base_type: "type/Integer" } }),
};

const setup = (props: Partial<ComponentProps<typeof Progress>> = {}) =>
  render(
    <Progress
      {...mockedProps}
      series={series()}
      settings={settings}
      visualizationIsClickable={() => false}
      {...props}
    />,
  );

describe("Progress", () => {
  // In the query builder there is no dashboard grid, so `gridSize` is
  // undefined. Reading `gridSize.height` without a guard threw and blanked the
  // chart (metabase#41243). The bar height must fall back gracefully instead.
  it("renders without a gridSize prop (query builder) (metabase#41243)", () => {
    setup({ gridSize: undefined });

    expect(screen.getByText("18,760")).toBeInTheDocument();
    expect(screen.getByText("Goal 0")).toBeInTheDocument();
    expect(screen.getByText("Goal exceeded")).toBeInTheDocument();
  });
});
