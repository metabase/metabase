import React from "react";
import { render, cleanup } from "@testing-library/react";

import { NumberColumn } from "../__support__/visualizations";

import Visualization from "metabase/visualizations/components/Visualization";

const series = (rows, settings = {}) => {
  const cols = [NumberColumn({ name: "Foo" })];
  return [
    {
      card: {
        display: "table",
        visualization_settings: settings,
      },
      data: { rows, cols },
    },
  ];
};

describe("Table", () => {
  afterEach(cleanup);

  it("should render correct background colors", () => {
    const rows = [[1], [2], [3], [4]];
    const settings = {
      "table.column_formatting": [
        {
          color: "#FF0000",
          columns: ["Foo"],
          type: "single",
          operator: ">",
          value: 2,
          highlight_row: false,
        },
      ],
    };
    const { getByText } = render(
      <Visualization rawSeries={series(rows, settings)} />,
    );
    const bgColors = rows.map(
      ([v]) => getByText(String(v)).parentNode.style["background-color"],
    );
    expect(bgColors).toEqual([
      "",
      "",
      "rgba(255, 0, 0, 0.65)",
      "rgba(255, 0, 0, 0.65)",
    ]);
  });
});
