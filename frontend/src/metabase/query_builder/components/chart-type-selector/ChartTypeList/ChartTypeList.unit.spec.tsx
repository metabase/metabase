import { renderWithProviders, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import { DEFAULT_VIZ_ORDER, visualizations } from "metabase/viz-core";

import { ChartTypeList, type ChartTypeListProps } from "./ChartTypeList";

registerVisualizations();

const VISUALIZATION_TEST_LABELS = DEFAULT_VIZ_ORDER.map((display) =>
  visualizations.get(display)?.getUiName(),
);

const setup = ({
  onSelectVisualization = jest.fn(),
  selectedVisualization = "table",
  visualizationList = DEFAULT_VIZ_ORDER,
}: Partial<ChartTypeListProps> = {}) => {
  renderWithProviders(
    <ChartTypeList
      visualizationList={visualizationList}
      selectedVisualization={selectedVisualization}
      onSelectVisualization={onSelectVisualization}
    />,
  );
};

describe("ChartTypeList", () => {
  it("should display a given list of visualizations", () => {
    setup();
    screen.getAllByRole("option").map((element, index) => {
      const withinElement = within(element);
      expect(
        withinElement.getByText(checkNotNull(VISUALIZATION_TEST_LABELS[index])),
      ).toBeInTheDocument();
      expect(
        withinElement.getByTestId(`${VISUALIZATION_TEST_LABELS[index]}-button`),
      ).toBeInTheDocument();
    });
  });
});
