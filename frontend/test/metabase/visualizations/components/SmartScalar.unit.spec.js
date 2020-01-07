import React from "react";
import { render, cleanup } from "@testing-library/react";

import { NumberColumn, DateTimeColumn } from "../__support__/visualizations";

import Visualization from "metabase/visualizations/components/Visualization";

const series = ({ rows, insights }) => {
  const cols = [
    DateTimeColumn({ name: "Month" }),
    NumberColumn({ name: "Count" }),
  ];
  return [{ card: { display: "smartscalar" }, data: { cols, rows, insights } }];
};

describe("SmartScalar", () => {
  afterEach(cleanup);

  it("should show 20% increase", () => {
    const rows = [["2019-10-01T00:00:00", 100], [("2019-11-01T00:00:00", 120)]];
    const insights = [
      {
        "last-value": 120,
        "last-change": 0.2,
        "previous-value": 100,
        unit: "month",
        col: "Count",
      },
    ];
    const { getAllByText } = render(
      <Visualization rawSeries={series({ rows, insights })} />,
    );
    getAllByText("120");
    getAllByText("20%");
    getAllByText("was 100");
    getAllByText("last month");
  });

  it("should show 20% decrease", () => {
    const rows = [["2019-10-01T00:00:00", 100], [("2019-11-01T00:00:00", 80)]];
    const insights = [
      {
        "last-value": 80,
        "last-change": -0.2,
        "previous-value": 100,
        unit: "month",
        col: "Count",
      },
    ];
    const { getAllByText } = render(
      <Visualization rawSeries={series({ rows, insights })} />,
    );
    getAllByText("80");
    getAllByText("20%");
    getAllByText("was 100");
    getAllByText("last month");
  });

  it("should show 0% change", () => {
    const rows = [["2019-10-01T00:00:00", 100], [("2019-11-01T00:00:00", 100)]];
    const insights = [
      {
        "last-value": 100,
        "last-change": 0,
        "previous-value": 100,
        unit: "month",
        col: "Count",
      },
    ];
    const { getAllByText } = render(
      <Visualization rawSeries={series({ rows, insights })} />,
    );
    getAllByText("100");
    getAllByText("No change from last month");
  });

  it("should show 8000% change", () => {
    const rows = [
      ["2019-10-01T00:00:00", 100],
      [("2019-11-01T00:00:00", 8100)],
    ];
    const insights = [
      {
        "last-value": 8100,
        "last-change": 80,
        "previous-value": 100,
        unit: "month",
        col: "Count",
      },
    ];
    const { getAllByText } = render(
      <Visualization rawSeries={series({ rows, insights })} />,
    );
    getAllByText("8,000%");
  });
});
