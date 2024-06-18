// these tests use ChartSettings directly, but logic we're testing lives in ChartNestedSettingSeries
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import ChartSettings from "metabase/visualizations/components/ChartSettings";
import registerVisualizations from "metabase/visualizations/register";

registerVisualizations();

function getSeries(display, index, changeSeriesName) {
  return {
    card: {
      display,
      visualization_settings: changeSeriesName
        ? {
            series_settings: {
              [`Test ${index}`]: { title: `Test ${index} updated` },
            },
          }
        : {},
      name: `Test ${index}`,
    },
    data: {
      rows: [
        ["a", 1],
        ["b", 2],
      ],
      cols: [{ name: "foo" }, { name: "bar" }],
    },
  };
}

const setup = (seriesDisplay, numberOfSeries = 1, changeSeriesName = false) => {
  const series = new Array(numberOfSeries)
    .fill(1)
    .map((s, index) => getSeries(seriesDisplay, index, changeSeriesName));
  return renderWithProviders(
    <ChartSettings
      series={series}
      initial={{ section: "Display" }}
      isDashboard={true}
    />,
  );
};

describe("ChartNestedSettingSeries", () => {
  it("shouldn't show line/area/bar buttons for row charts", () => {
    setup("row");

    expect(
      screen.queryByRole("img", { name: /line/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /area/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /bar/i })).not.toBeInTheDocument();
  });

  it("should show line/area/bar buttons for bar charts", () => {
    setup("bar");

    expect(screen.getByRole("img", { name: /line/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /area/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /bar/i })).toBeInTheDocument();
  });

  it("should show and open 'More options' on visualizations with multiple lines (metabase#17619)", async () => {
    setup("line", 3);
    //Check that all series are present
    expect(screen.getByDisplayValue("Test 0")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test 1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test 2")).toBeInTheDocument();

    //Because there are multiple series, all should be collapsed
    const expandButtons = screen.getAllByRole("img", { name: /chevrondown/i });
    expect(expandButtons).toHaveLength(3);

    expect(screen.queryByText("Line shape")).not.toBeInTheDocument();
    expect(screen.queryByText("Show dots on lines")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Replace missing values with"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Y-axis position")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Show values for this series"),
    ).not.toBeInTheDocument();

    //Expand a section
    await userEvent.click(expandButtons[0]);
    expect(screen.getByRole("img", { name: /chevronup/i })).toBeInTheDocument();
    expect(screen.getByText("Line shape")).toBeInTheDocument();
    expect(screen.getByText("Show dots on lines")).toBeInTheDocument();
    expect(screen.getByText("Replace missing values with")).toBeInTheDocument();
    expect(screen.getByText("Y-axis position")).toBeInTheDocument();
    expect(screen.getByText("Show values for this series")).toBeInTheDocument();

    //Expand another section, should only be 1 open section
    await userEvent.click(expandButtons[1]);
    expect(screen.getByRole("img", { name: /chevronup/i })).toBeInTheDocument();
  });

  it("should show original series title in subtitle if it's changed", () => {
    setup("line", 1, true);

    const seriesSettings = screen.getByTestId("series-settings");
    expect(within(seriesSettings).getByText("Test 0")).toBeInTheDocument();
    expect(screen.getByLabelText("series-name-input")).toHaveValue(
      "Test 0 updated",
    );
  });

  it("should not show a series subtitle if the series name has not changed", () => {
    setup("line", 1);

    const seriesSettings = screen.getByTestId("series-settings");
    expect(
      within(seriesSettings).queryByText("Test 0"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("series-name-input")).toHaveValue("Test 0");
  });
});
