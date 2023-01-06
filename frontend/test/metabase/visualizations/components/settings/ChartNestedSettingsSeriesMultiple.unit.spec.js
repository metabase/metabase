import React from "react";
import { queryByText } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "__support__/ui";

// these tests use ChartSettings directly, but logic we're testing lives in ChartNestedSettingSeries
import ChartSettings from "metabase/visualizations/components/ChartSettings";

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
    const { queryByRole } = setup("row");

    expect(queryByRole("img", { name: /line/i })).not.toBeInTheDocument();
    expect(queryByRole("img", { name: /area/i })).not.toBeInTheDocument();
    expect(queryByRole("img", { name: /bar/i })).not.toBeInTheDocument();
  });

  it("should show line/area/bar buttons for bar charts", () => {
    const { getByRole } = setup("bar");

    expect(getByRole("img", { name: /line/i })).toBeInTheDocument();
    expect(getByRole("img", { name: /area/i })).toBeInTheDocument();
    expect(getByRole("img", { name: /bar/i })).toBeInTheDocument();
  });

  it("should show and open 'More options' on visualizations with multiple lines (metabase#17619)", () => {
    const { getByDisplayValue, getAllByRole, getByText, queryByText } = setup(
      "line",
      3,
    );
    //Check that all series are present
    expect(getByDisplayValue("Test 0")).toBeInTheDocument();
    expect(getByDisplayValue("Test 1")).toBeInTheDocument();
    expect(getByDisplayValue("Test 2")).toBeInTheDocument();

    //Because there are multiple series, all should be collapsed
    const expandButtons = getAllByRole("img", { name: /chevrondown/i });
    expect(expandButtons).toHaveLength(3);

    expect(queryByText("Line style")).not.toBeInTheDocument();
    expect(queryByText("Show dots on lines")).not.toBeInTheDocument();
    expect(queryByText("Replace missing values with")).not.toBeInTheDocument();
    expect(queryByText("Y-axis position")).not.toBeInTheDocument();
    expect(queryByText("Show values for this series")).not.toBeInTheDocument();

    //Expand a section
    userEvent.click(expandButtons[0]);
    expect(getByRole("img", { name: /chevronup/i })).toBeInTheDocument();
    expect(getByText("Line style")).toBeInTheDocument();
    expect(getByText("Show dots on lines")).toBeInTheDocument();
    expect(getByText("Replace missing values with")).toBeInTheDocument();
    expect(getByText("Y-axis position")).toBeInTheDocument();
    expect(getByText("Show values for this series")).toBeInTheDocument();

    //Expand another section, should only be 1 open section
    userEvent.click(expandButtons[1]);
    expect(getByRole("img", { name: /chevronup/i })).toBeInTheDocument();
  });

  it("should show original series title in subtitle if it's changed", () => {
    const { getByTestId, getByLabelText } = setup("line", 1, true);

    const seriesSettings = getByTestId("series-settings");
    expect(queryByText(seriesSettings, "Test 0")).toBeInTheDocument();
    expect(getByLabelText("series-name-input")).toHaveValue("Test 0 updated");
  });

  it("should not show a series subtitle if the series name has not changed", () => {
    const { getByTestId, getByLabelText } = setup("line", 1);

    const seriesSettings = getByTestId("series-settings");
    expect(queryByText(seriesSettings, "Test 0")).not.toBeInTheDocument();
    expect(getByLabelText("series-name-input")).toHaveValue("Test 0");
  });
});
