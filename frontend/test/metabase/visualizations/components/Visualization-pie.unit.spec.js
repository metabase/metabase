import React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";

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
    const { getAllByText } = render(<Visualization rawSeries={series(rows)} />);
    getAllByText("20%");
    getAllByText("40%");
  });

  it("should use a consistent number of decimals", () => {
    const rows = [["foo", 0.5], ["bar", 0.499], ["baz", 0.001]];
    const { getAllByText } = render(<Visualization rawSeries={series(rows)} />);
    getAllByText("50.0%");
    getAllByText("49.9%");
    getAllByText("0.1%");
  });

  it("should squash small slices into 'Other'", () => {
    const rows = [["foo", 0.5], ["bar", 0.49], ["baz", 0.002], ["qux", 0.008]];
    const { getAllByText } = render(<Visualization rawSeries={series(rows)} />);
    getAllByText("50%");
    getAllByText("49%");
    getAllByText("1%");
  });

  it("should not use column formatting in the legend", () => {
    const cols = [
      StringColumn({ name: "name" }),
      NumberColumn({ name: "count" }),
    ];
    const column_settings = { '["name","count"]': { scale: 123 } };
    const series = [
      {
        card: { display: "pie", visualization_settings: { column_settings } },
        data: { rows: [["foo", 1]], cols },
      },
    ];
    const { getAllByText } = render(<Visualization rawSeries={series} />);
    getAllByText("100%"); // shouldn't multiply legend percent by `scale`
    getAllByText("123"); // should multiply the count in the center by `scale`
  });

  it("should show a condensed tooltip for squashed slices", () => {
    const rows = [["foo", 0.5], ["bar", 0.49], ["baz", 0.002], ["qux", 0.008]];
    const { container, getAllByText, queryAllByText } = render(
      <Visualization rawSeries={series(rows)} />,
    );
    const paths = container.querySelectorAll("path");
    const otherPath = paths[paths.length - 1];

    // condensed tooltips display as "dimension: metric"
    expect(queryAllByText("baz:").length).toBe(0);
    expect(queryAllByText("qux:").length).toBe(0);
    fireEvent.mouseMove(otherPath);
    // these appear twice in the dom due to some popover weirdness
    expect(getAllByText("baz:").length).toBe(2);
    expect(getAllByText("qux:").length).toBe(2);
  });

  it("shouldn't show a condensed tooltip for just one squashed slice", () => {
    const rows = [["foo", 0.5], ["bar", 0.49], ["baz", 0.002]];
    const { container, queryAllByText } = render(
      <Visualization rawSeries={series(rows)} />,
    );
    const paths = container.querySelectorAll("path");
    const otherPath = paths[paths.length - 1];

    fireEvent.mouseMove(otherPath);
    // normal tooltips don't use this "dimension: metric" format
    expect(queryAllByText("baz:").length).toBe(0);
  });
});
