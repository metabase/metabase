import { renderWithProviders, screen } from "__support__/ui";

import Visualization from "metabase/visualizations/components/Visualization";
import { NumberColumn } from "__support__/visualizations";

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
  beforeEach(() => {
    jest.useFakeTimers();
  });

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

    renderWithProviders(<Visualization rawSeries={series(rows, settings)} />);
    jest.runAllTimers();

    const bgColors = rows
      .map(([value]) => screen.getByText(String(value)))
      .map(element => element.parentNode.style["background-color"]);
    expect(bgColors).toEqual([
      "",
      "",
      "rgba(255, 0, 0, 0.65)",
      "rgba(255, 0, 0, 0.65)",
    ]);
  });
});
