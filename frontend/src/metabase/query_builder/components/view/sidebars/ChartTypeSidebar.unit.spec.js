import { render, fireEvent, screen, within } from "@testing-library/react";

import { createMockMetadata } from "__support__/metadata";
import ChartTypeSidebar from "metabase/query_builder/components/view/sidebars/ChartTypeSidebar";
import registerVisualizations from "metabase/visualizations/register";
import {
  createSampleDatabase,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

registerVisualizations();

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const DATA = {
  rows: [[1]],
  cols: [{ base_type: "type/Integer", name: "foo", display_name: "foo" }],
};

const setup = props => {
  const question = metadata
    .database(SAMPLE_DB_ID)
    .question()
    .setDisplay("gauge");

  render(
    <ChartTypeSidebar
      question={question}
      query={question.legacyQuery({ useStructuredQuery: true })}
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
    const updateQuestion = jest.fn();
    const setUIControls = jest.fn();

    setup({
      updateQuestion,
      setUIControls,
    });

    fireEvent.click(screen.getByTestId("Progress-button"));

    expect(setUIControls).toHaveBeenCalledWith({ isShowingRawTable: false });
    expect(updateQuestion).toHaveBeenCalled();
  });

  it("should transition to settings page when clicking on the active display type", () => {
    const onOpenChartSettings = jest.fn();

    setup({
      onOpenChartSettings,
    });

    fireEvent.click(screen.getByTestId("Gauge-button"));

    expect(onOpenChartSettings).toHaveBeenCalledWith({
      initialChartSettings: { section: "Data" },
      showSidebarTitle: true,
    });
  });

  it("should display a gear icon when hovering selected display type", () => {
    const onOpenChartSettings = jest.fn();
    setup({
      onOpenChartSettings,
    });

    expect(
      within(screen.getByTestId("Gauge-button")).getByRole("img", {
        name: /gear/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("img", { name: /gear/i }));
    expect(onOpenChartSettings).toHaveBeenCalledWith({
      initialChartSettings: { section: "Data" },
      showSidebarTitle: true,
    });
  });

  it("should group sensible and nonsensible options separately and in the correct order", () => {
    setup();

    const sensible = within(
      screen.getByTestId("display-options-sensible"),
    ).getAllByTestId(/container/i);
    const nonSensible = within(
      screen.getByTestId("display-options-not-sensible"),
    ).getAllByTestId(/container/i);

    const sensibleOrder = ["Table", "Number", "Gauge", "Progress", "Detail"];
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

    expect(sensible).toHaveLength(sensibleOrder.length);
    expect(nonSensible).toHaveLength(nonSensibleOrder.length);

    sensible.forEach((node, index) => {
      expect(node).toHaveTextContent(sensibleOrder[index]);
    });

    nonSensible.forEach((node, index) => {
      expect(node).toHaveTextContent(nonSensibleOrder[index]);
    });
  });
});
