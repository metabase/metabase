import React from "react";
import { render, cleanup } from "@testing-library/react";

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
  afterEach(cleanup);

  it("should render title on dashboards", () => {
    const { getByText } = render(
      <Scalar
        series={series()}
        settings={settings}
        isDashboard={true}
        visualizationIsClickable={() => false}
      />,
    );
    getByText("Scalar Title");
  });

  it("shouldn't render compact if normal formatting is <=6 characters", () => {
    const { getByText } = render(
      <Scalar
        series={series(12345)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={230}
      />,
    );
    getByText("12,345"); // with compact formatting, we'd have 1
  });

  it("should render compact if normal formatting is >6 characters", () => {
    const { getByText } = render(
      <Scalar
        series={series(12345.6)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={230}
      />,
    );
    getByText("12.3k");
  });
});
