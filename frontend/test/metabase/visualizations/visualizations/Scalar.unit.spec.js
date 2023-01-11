import React from "react";
import { render, screen } from "@testing-library/react";
import Scalar from "metabase/visualizations/visualizations/Scalar";

const series = (value = 1.23) => [
  {
    card: {},
    data: { rows: [[value]], cols: [{ name: "count" }] },
  },
];
const settings = {
  "scalar.field": "count",
  "card.title": "Scalar Title",
  column: () => ({ column: { base_type: "type/Integer" } }),
};

describe("MetricForm", () => {
  it("should render title on dashboards", () => {
    render(
      <Scalar
        series={series()}
        settings={settings}
        isDashboard={true}
        visualizationIsClickable={() => false}
      />,
    );
    expect(screen.getByText("Scalar Title")).toBeInTheDocument();
  });

  it("shouldn't render compact if normal formatting is <=6 characters", () => {
    render(
      <Scalar
        series={series(12345)}
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
        series={series(12345.6)}
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
        isDashboard // displays title
        series={series(null)}
        settings={settings}
        visualizationIsClickable={() => false}
      />,
    );
    expect(screen.getByText("Scalar Title")).toBeInTheDocument(); // just confirms that it rendered
  });
});
