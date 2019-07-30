jest.mock("metabase/components/ExplicitSize");

import React from "react";
import { render, cleanup } from "@testing-library/react";

import { NumberColumn, StringColumn } from "../__support__/visualizations";

import Visualization from "metabase/visualizations/components/Visualization";

const series = rows => {
  const cols = [
    StringColumn({ name: "Name" }),
    NumberColumn({ name: "Count" }),
  ];
  return [{ card: { display: "pie" }, data: { rows, cols } }];
};

describe("pie chart", () => {
  afterEach(cleanup);

  it("should render correct percentages in legend", () => {
    const rows = [["foo", 1], ["bar", 2], ["baz", 2]];
    const { getByText, getAllByText } = render(
      <Visualization rawSeries={series(rows)} />,
    );
    getByText("20%");
    expect(getAllByText("40%").length).toBe(2);
  });

  it("should use a consistent number of decimals", () => {
    const rows = [["foo", 0.5], ["bar", 0.499], ["baz", 0.001]];
    const { getByText } = render(<Visualization rawSeries={series(rows)} />);
    getByText("50.0%");
    getByText("49.9%");
    getByText("0.1%");
  });

  it("should squash small slices into 'Other'", () => {
    const rows = [["foo", 0.5], ["bar", 0.49], ["baz", 0.002], ["qux", 0.008]];
    const { getByText } = render(<Visualization rawSeries={series(rows)} />);
    getByText("50%");
    getByText("49%");
    getByText("1%");
  });
});
