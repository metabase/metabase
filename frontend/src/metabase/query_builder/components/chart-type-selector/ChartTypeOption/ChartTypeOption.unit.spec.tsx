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

const EXPECTED_VISUALIZATION_VALUES: Record<
  CardDisplayType,
  {
    key: CardDisplayType;
    displayName: string;
    iconName: IconName | (string & unknown);
  }
> = {
  scalar: { key: "scalar", displayName: "Number", iconName: "number" },
  smartscalar: {
    key: "smartscalar",
    displayName: "Trend",
    iconName: "smartscalar",
  },
  progress: { key: "progress", displayName: "Progress", iconName: "progress" },
  gauge: { key: "gauge", displayName: "Gauge", iconName: "gauge" },
  table: { key: "table", displayName: "Table", iconName: "table2" },
  line: { key: "line", displayName: "Line", iconName: "line" },
  area: { key: "area", displayName: "Area", iconName: "area" },
  bar: { key: "bar", displayName: "Bar", iconName: "bar" },
  waterfall: {
    key: "waterfall",
    displayName: "Waterfall",
    iconName: "waterfall",
  },
  combo: { key: "combo", displayName: "Combo", iconName: "lineandbar" },
  row: { key: "row", displayName: "Row", iconName: "horizontal_bar" },
  scatter: { key: "scatter", displayName: "Scatter", iconName: "bubble" },
  pie: { key: "pie", displayName: "Pie", iconName: "pie" },
  map: { key: "map", displayName: "Map", iconName: "pinmap" },
  funnel: { key: "funnel", displayName: "Funnel", iconName: "funnel" },
  object: { key: "object", displayName: "Detail", iconName: "document" },
  pivot: { key: "pivot", displayName: "Pivot Table", iconName: "pivot_table" },
};

const setup = ({
  selectedVisualization = "table",
  onSelectVisualization = jest.fn(),
  visualizationType = "bar",
}: Partial<ChartTypeOptionProps> = {}) => {
  renderWithProviders(
    <ChartTypeOption
      selectedVisualization={selectedVisualization}
      onSelectVisualization={onSelectVisualization}
      visualizationType={visualizationType}
    />,
  );

  return { onSelectVisualization };
};

describe("ChartTypeOption", () => {
  Object.entries(EXPECTED_VISUALIZATION_VALUES).forEach(
    ([key, { iconName, displayName }]) => {
      it(`should display a label and icon for ${key} visualization type`, () => {
        setup({
          visualizationType: key as CardDisplayType,
        });

        expect(
          screen.getByTestId(`${displayName}-container`),
        ).toBeInTheDocument();
        expect(getIcon(iconName)).toBeInTheDocument();
        expect(screen.getByTestId("chart-type-option-label")).toHaveTextContent(
          displayName,
        );
      });

      it("should call 'onClick' when the button is clicked", async () => {
        const { onSelectVisualization } = setup({
          visualizationType: key as CardDisplayType,
        });

        await userEvent.click(screen.getByTestId(`${displayName}-button`));

        expect(onSelectVisualization).toHaveBeenCalledWith(key);
      });

      //   TODO: include styles in the tests when component is migrated to Mantine
      it("should have aria-selected attribute if selectedVisualization=visualizationType", () => {
        setup({
          selectedVisualization: key as CardDisplayType,
          visualizationType: key as CardDisplayType,
        });

        expect(screen.getByTestId(`${displayName}-container`)).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });
    },
  );

  it("should display a gear icon when hovering display type when selected", async () => {
    const { onSelectVisualization } = setup({
      visualizationType: "bar",
      selectedVisualization: "bar",
    });

    expect(screen.getByTestId("Bar-button")).toBeInTheDocument();
    await userEvent.hover(screen.getByTestId("Bar-button"));

    await userEvent.click(getIcon("gear"));
    expect(onSelectVisualization).toHaveBeenCalled();
  });

  it("should not display a gear icon when hovering display type when not selected", async () => {
    setup({
      visualizationType: "bar",
      selectedVisualization: "table",
    });

    expect(screen.getByTestId("Bar-button")).toBeInTheDocument();
    await userEvent.hover(screen.getByTestId("Bar-button"));

    expect(queryIcon("gear")).not.toBeInTheDocument();
  });
});
