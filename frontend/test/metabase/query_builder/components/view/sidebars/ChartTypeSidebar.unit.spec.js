import React from "react";
import { render, fireEvent, screen, within } from "@testing-library/react";

import { SAMPLE_DATABASE } from "__support__/sample_database_fixture";

import ChartTypeSidebar from "metabase/query_builder/components/view/sidebars/ChartTypeSidebar";

const DATA = {
  rows: [[1]],
  cols: [{ base_type: "type/Integer", name: "foo", display_name: "foo" }],
};

const setup = props => {
  const question = SAMPLE_DATABASE.question().setDisplay("gauge");
  render(
    <ChartTypeSidebar
      question={question}
      query={question.query()}
      result={{ data: DATA }}
      {...props}
    />,
  );
};

describe("ChartSettingsSidebar", () => {
  it("should highlight the correct display type", () => {
    setup();

    //active display type
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
      "Gauge",
    );
  });

  it("should call correct functions when display type is selected", () => {
    const onOpenChartSettings = jest.fn();
    const updateQuestion = jest.fn();
    const setUIControls = jest.fn();

    setup({
      onOpenChartSettings,
      updateQuestion,
      setUIControls,
    });

    fireEvent.click(
      within(screen.getByTestId("Progress-button")).getByRole("img"),
    );

    expect(onOpenChartSettings).toHaveBeenCalledWith({ section: "Data" });
    expect(setUIControls).toHaveBeenCalledWith({ isShowingRawTable: false });
    expect(updateQuestion).toHaveBeenCalled();
  });

  it("should group sensible and nonsensible options separately and in the correct order", () => {
    setup();

    const sensible = within(
      screen.getByTestId("display-options-sensible"),
    ).getAllByTestId(/container/i);
    const nonSensible = within(
      screen.getByTestId("display-options-not-sensible"),
    ).getAllByTestId(/container/i);

    expect(sensible).toHaveLength(5);
    expect(nonSensible).toHaveLength(12);

    const sensibleOrder = [
      "Table",
      "Number",
      "Gauge",
      "Progress",
      "Object Detail",
    ];
    const nonSensibleOrder = [
      "Bar",
      "Line",
      "Pie",
      "Row",
      "Area",
      "Combo",
      "Pivot Table",
      "Trend",
      "Funnel",
      "Map",
      "Scatter",
      "Waterfall",
    ];

    sensible.forEach((node, index) => {
      expect(node).toHaveTextContent(sensibleOrder[index]);
    });

    nonSensible.forEach((node, index) => {
      expect(node).toHaveTextContent(nonSensibleOrder[index]);
    });
  });
});
