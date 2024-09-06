import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import registerVisualizations from "metabase/visualizations/register";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  ChartTypeSidebar,
  type ChartTypeSidebarProps,
} from "./ChartTypeSidebar";

registerVisualizations();

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const DATA = createMockDatasetData({
  rows: [[1]],
  cols: [
    createMockColumn({
      base_type: "type/Integer",
      name: "foo",
      display_name: "foo",
    }),
  ],
});

const setup = (props: Partial<ChartTypeSidebarProps> = {}) => {
  const question = checkNotNull(
    metadata.database(SAMPLE_DB_ID)?.question().setDisplay("gauge"),
  );

  renderWithProviders(
    <ChartTypeSidebar
      question={question}
      result={createMockDataset({ data: DATA })}
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

    userEvent.click(screen.getByTestId("Progress-button"));

    expect(setUIControls).toHaveBeenCalledWith({ isShowingRawTable: false });
    expect(updateQuestion).toHaveBeenCalled();
  });

  it("should transition to settings page when clicking on the active display type", () => {
    const onOpenChartSettings = jest.fn();

    setup({
      onOpenChartSettings,
    });

    userEvent.click(screen.getByTestId("Gauge-button"));

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

    userEvent.click(screen.getByRole("img", { name: /gear/i }));
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
