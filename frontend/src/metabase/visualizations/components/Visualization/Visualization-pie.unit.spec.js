import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import registerVisualizations from "metabase/visualizations/register";

registerVisualizations();

const series = rows => {
  const cols = [
    StringColumn({ name: "Name" }),
    NumberColumn({ name: "Count" }),
  ];
  return [{ card: { display: "pie" }, data: { rows, cols } }];
};

const setup = series =>
  renderWithProviders(<Visualization rawSeries={series} />);

describe("pie chart", () => {
  it("should render correct percentages in legend", () => {
    const rows = [
      ["foo", 1],
      ["bar", 2],
      ["baz", 2],
    ];

    setup(series(rows));

    expect(screen.getAllByText("20%")).toHaveLength(2);
    expect(screen.getAllByText("40%")).toHaveLength(4);
  });

  it("should use a consistent number of decimals", () => {
    const rows = [
      ["foo", 0.5],
      ["bar", 0.499],
      ["baz", 0.001],
    ];

    setup(series(rows));

    expect(screen.getAllByText("50.0%")).toHaveLength(2);
    expect(screen.getAllByText("49.9%")).toHaveLength(2);
    expect(screen.getAllByText("0.1%")).toHaveLength(2);
  });

  it("should squash small slices into 'Other'", () => {
    const rows = [
      ["foo", 0.5],
      ["bar", 0.49],
      ["baz", 0.002],
      ["qux", 0.008],
    ];

    setup(series(rows));

    expect(screen.getAllByText("50%")).toHaveLength(2);
    expect(screen.getAllByText("49%")).toHaveLength(2);
    expect(screen.getAllByText("1%")).toHaveLength(2);
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

    setup(series);

    // shouldn't multiply legend percent by `scale`
    expect(screen.getAllByText("100%")).toHaveLength(2);

    // should multiply the count in the center by `scale`
    expect(screen.getByText("123")).toBeInTheDocument();
  });

  it("should obey number separator settings", () => {
    const cols = [
      StringColumn({ name: "name" }),
      NumberColumn({ name: "count" }),
    ];
    const column_settings = { '["name","count"]': { number_separators: ", " } };
    const series = [
      {
        card: { display: "pie", visualization_settings: { column_settings } },
        data: {
          rows: [
            ["foo", 0.501],
            ["bar", 0.499],
          ],
          cols,
        },
      },
    ];
    setup(series);

    expect(screen.getAllByText("50,1%")).toHaveLength(2);
  });

  it("should show a condensed tooltip for squashed slices", () => {
    const rows = [
      ["foo", 0.5],
      ["bar", 0.49],
      ["baz", 0.002],
      ["qux", 0.008],
    ];
    setup(series(rows));
    const paths = screen.getAllByTestId("slice");
    const otherPath = paths[paths.length - 1];

    // condensed tooltips display as "dimension: metric"
    expect(screen.queryByText("baz")).not.toBeInTheDocument();
    expect(screen.queryByText("qux")).not.toBeInTheDocument();

    fireEvent.mouseMove(otherPath);

    expect(screen.getByText("baz")).toBeInTheDocument();
    expect(screen.getByText("qux")).toBeInTheDocument();
  });

  it("shouldn't show a condensed tooltip for just one squashed slice", () => {
    const rows = [
      ["foo", 0.5],
      ["bar", 0.49],
      ["baz", 0.002],
    ];
    setup(series(rows));
    const paths = screen.getAllByTestId("slice");
    const otherPath = paths[paths.length - 1];

    fireEvent.mouseMove(otherPath);

    // normal tooltips don't use this "dimension: metric" format
    expect(screen.queryByText("baz:")).not.toBeInTheDocument();
  });
});
