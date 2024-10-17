import userEvent from "@testing-library/user-event";

import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { IconName } from "metabase/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { CardDisplayType } from "metabase-types/api";

import { ChartTypeOption, type ChartTypeOptionProps } from "./ChartTypeOption";

registerVisualizations();

const EXPECTED_VISUALIZATION_VALUES: Array<{
  visualizationType: CardDisplayType;
  displayName: string;
  iconName: IconName | (string & unknown);
}> = [
  { visualizationType: "scalar", displayName: "Number", iconName: "number" },
  {
    visualizationType: "smartscalar",
    displayName: "Trend",
    iconName: "smartscalar",
  },
  {
    visualizationType: "progress",
    displayName: "Progress",
    iconName: "progress",
  },
  { visualizationType: "gauge", displayName: "Gauge", iconName: "gauge" },
  { visualizationType: "table", displayName: "Table", iconName: "table2" },
  { visualizationType: "line", displayName: "Line", iconName: "line" },
  { visualizationType: "area", displayName: "Area", iconName: "area" },
  { visualizationType: "bar", displayName: "Bar", iconName: "bar" },
  {
    visualizationType: "waterfall",
    displayName: "Waterfall",
    iconName: "waterfall",
  },
  { visualizationType: "combo", displayName: "Combo", iconName: "lineandbar" },
  { visualizationType: "row", displayName: "Row", iconName: "horizontal_bar" },
  { visualizationType: "scatter", displayName: "Scatter", iconName: "bubble" },
  { visualizationType: "pie", displayName: "Pie", iconName: "pie" },
  { visualizationType: "map", displayName: "Map", iconName: "pinmap" },
  { visualizationType: "funnel", displayName: "Funnel", iconName: "funnel" },
  { visualizationType: "object", displayName: "Detail", iconName: "document" },
  {
    visualizationType: "pivot",
    displayName: "Pivot Table",
    iconName: "pivot_table",
  },
];

const setup = ({
  selectedVisualization = "table",
  onSelectVisualization = jest.fn(),
  visualizationType = "bar",
  onOpenSettings = jest.fn(),
}: Partial<ChartTypeOptionProps> = {}) => {
  renderWithProviders(
    <ChartTypeOption
      selectedVisualization={selectedVisualization}
      onSelectVisualization={onSelectVisualization}
      visualizationType={visualizationType}
      onOpenSettings={onOpenSettings}
    />,
  );

  return { onSelectVisualization, onOpenSettings };
};

describe("ChartTypeOption", () => {
  describe.each(EXPECTED_VISUALIZATION_VALUES)(
    "display and click behavior for each visualization",
    ({ visualizationType, displayName, iconName }) => {
      it(`should display a label and icon for ${visualizationType} visualization type`, () => {
        setup({
          visualizationType,
        });

        expect(
          screen.getByTestId(`${displayName}-container`),
        ).toBeInTheDocument();
        expect(getIcon(iconName)).toBeInTheDocument();
        expect(screen.getByTestId("chart-type-option-label")).toHaveTextContent(
          displayName,
        );
      });

      it("should call 'onSelectVisualization' when the button is clicked and the visualization hasn't been selected", async () => {
        const { onSelectVisualization } = setup({
          visualizationType,
          selectedVisualization: EXPECTED_VISUALIZATION_VALUES.find(
            elem => elem.visualizationType !== visualizationType,
          )?.visualizationType,
        });

        await userEvent.click(screen.getByTestId(`${displayName}-button`));

        expect(onSelectVisualization).toHaveBeenCalledWith(visualizationType);
      });

      it("should call 'onOpenSettings' when the button is clicked and the visualization has been selected", async () => {
        const { onOpenSettings } = setup({
          visualizationType,
          selectedVisualization: visualizationType,
        });

        await userEvent.click(screen.getByTestId(`${displayName}-button`));

        expect(onOpenSettings).toHaveBeenCalled();
      });

      it("should have aria-selected attribute if selectedVisualization=visualizationType", () => {
        setup({
          selectedVisualization: visualizationType,
          visualizationType,
        });

        const displayContainer = screen.getByTestId(`${displayName}-container`);
        expect(displayContainer).toHaveAttribute("aria-selected", "true");

        expect(displayContainer).toHaveRole("option");
      });
    },
  );

  describe("when onOpenSettings is set", () => {
    it("should display a gear icon when the type is selected and user is hovering over it", async () => {
      const { onOpenSettings } = setup({
        visualizationType: "bar",
        selectedVisualization: "bar",
      });

      expect(screen.getByTestId("Bar-button")).toBeInTheDocument();
      await userEvent.hover(screen.getByTestId("Bar-button"));

      await userEvent.click(getIcon("gear"));
      expect(onOpenSettings).toHaveBeenCalled();
    });

    it("should not display a gear icon when the type is not selected and the user is hovering over it", async () => {
      setup({
        visualizationType: "bar",
        selectedVisualization: "table",
      });

      expect(screen.getByTestId("Bar-button")).toBeInTheDocument();
      await userEvent.hover(screen.getByTestId("Bar-button"));

      expect(queryIcon("gear")).not.toBeInTheDocument();
    });
  });

  it("should not display a gear icon when onOpenSettings is not set", async () => {
    setup({
      visualizationType: "bar",
      selectedVisualization: "table",
      onOpenSettings: undefined,
    });

    expect(screen.getByTestId("Bar-button")).toBeInTheDocument();
    await userEvent.hover(screen.getByTestId("Bar-button"));

    expect(queryIcon("gear")).not.toBeInTheDocument();
  });
});
