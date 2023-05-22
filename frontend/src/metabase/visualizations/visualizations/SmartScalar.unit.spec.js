import React from "react";
import { renderWithProviders, screen } from "__support__/ui";

import Visualization from "metabase/visualizations/components/Visualization";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { NumberColumn, DateTimeColumn } from "__support__/visualizations";

const setup = (series, width) =>
  renderWithProviders(<Visualization rawSeries={series} width={width} />);

const series = ({ rows, insights }) => {
  const cols = [
    DateTimeColumn({ name: "Month" }),
    NumberColumn({ name: "Count" }),
  ];
  return [{ card: { display: "smartscalar" }, data: { cols, rows, insights } }];
};

describe("SmartScalar", () => {
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

    setup(series({ rows, insights }));

    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("was 100")).toBeInTheDocument();
    expect(screen.getByText("last month")).toBeInTheDocument();
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

    setup(series({ rows, insights }));

    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("was 100")).toBeInTheDocument();
    expect(screen.getByText("last month")).toBeInTheDocument();
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

    setup(series({ rows, insights }));

    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("No change from last month")).toBeInTheDocument();
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

    setup(series({ rows, insights }));

    expect(screen.getByText("8,000%")).toBeInTheDocument();
  });

  it("shouldn't throw an error getting settings for single-column data", () => {
    const card = { display: "smartscalar", visualization_settings: {} };
    const data = { cols: [NumberColumn({ name: "Count" })], rows: [[100]] };
    expect(() => getSettingsWidgetsForSeries([{ card, data }])).not.toThrow();
  });

  it("shouldn't render compact if normal formatting is <=6 characters", () => {
    const width = 200;
    const rows = [
      ["2019-10-01T00:00:00", 100],
      [("2019-11-01T00:00:00", 81005)],
    ];
    const insights = [
      {
        "last-value": 81005,
        "last-change": 80,
        "previous-value": 100,
        unit: "month",
        col: "Count",
      },
    ];

    setup(series({ rows, insights }), width);

    expect(screen.getByText("81,005")).toBeInTheDocument();
  });

  it("should render compact if normal formatting is >6 characters and width <250", () => {
    const width = 200;
    const rows = [
      ["2019-10-01T00:00:00", 100],
      [("2019-11-01T00:00:00", 810750.54)],
    ];
    const insights = [
      {
        "last-value": 810750.54,
        "last-change": 80,
        "previous-value": 100,
        unit: "month",
        col: "Count",
      },
    ];

    setup(series({ rows, insights }), width);

    expect(screen.getByText("810.8k")).toBeInTheDocument();
  });
});
