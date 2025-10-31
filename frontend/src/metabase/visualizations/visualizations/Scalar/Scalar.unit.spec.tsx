import type { ComponentProps } from "react";

import { render, screen } from "__support__/ui";
import type { Series } from "metabase-types/api";
import { createMockCard, createMockColumn } from "metabase-types/api/mocks";

import { Scalar } from "./Scalar";

const series = (value: number | null = 1.23) =>
  [
    {
      card: createMockCard({ display: "scalar" }),
      data: { rows: [[value]], cols: [createMockColumn({ name: "count" })] },
    },
  ] as Series;

const mockedProps = {} as ComponentProps<typeof Scalar>;

const settings = {
  "scalar.field": "count",
  "card.title": "Scalar Title",
  column: () => ({ column: { base_type: "type/Integer" } }),
};

describe("Scalar", () => {
  it("shouldn't render compact if normal formatting is <=6 characters", () => {
    render(
      <Scalar
        {...mockedProps}
        series={series(12345)}
        rawSeries={series(12345)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={230}
      />,
    );
    expect(screen.getByText("12,345")).toBeInTheDocument(); // with compact formatting, we'd have 1
  });

  it("should render compact if normal formatting is >6 characters", () => {
    render(
      <Scalar
        {...mockedProps}
        series={series(12345.6)}
        rawSeries={series(12345.6)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={230}
      />,
    );
    expect(screen.getByText("12.3k")).toBeInTheDocument();
  });

  it("should render null", () => {
    render(
      <Scalar
        {...mockedProps}
        isDashboard // displays title
        showTitle
        series={series(null)}
        rawSeries={series(null)}
        settings={settings}
        visualizationIsClickable={() => false}
      />,
    );
    expect(screen.getByText("null")).toBeInTheDocument();
  });
});
