import userEvent from "@testing-library/user-event";

import { getIcon, render, screen } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";

import {
  ChartTypeSettings,
  type ChartTypeSettingsProps,
} from "./ChartTypeSettings";

registerVisualizations();

const setup = ({
  selectedVisualization = "bar",
}: Partial<ChartTypeSettingsProps> = {}) => {
  const onSelectVisualization = jest.fn();
  const sensibleVisualizations: ChartTypeSettingsProps["sensibleVisualizations"] =
    ["bar", "line"];
  const nonSensibleVisualizations: ChartTypeSettingsProps["nonSensibleVisualizations"] =
    ["pie", "scatter"];

  render(
    <ChartTypeSettings
      sensibleVisualizations={sensibleVisualizations}
      nonSensibleVisualizations={nonSensibleVisualizations}
      selectedVisualization={selectedVisualization}
      onSelectVisualization={onSelectVisualization}
    />,
  );

  return {
    onSelectVisualization,
  };
};

describe("ChartTypeSettings", () => {
  it("renders the sensible and non-sensible visualizations with an `Other charts` label", () => {
    setup();
    expect(screen.getByTestId("display-options-sensible")).toBeInTheDocument();
    expect(screen.getByText("Other charts")).toBeInTheDocument();
    expect(
      screen.getByTestId("display-options-not-sensible"),
    ).toBeInTheDocument();
  });

  it("passes correct props to ChartTypeLists", () => {
    setup();
    const sensibleList = screen.getByTestId("display-options-sensible");
    const nonSensibleList = screen.getByTestId("display-options-not-sensible");

    expect(sensibleList).toHaveAttribute(
      "data-testid",
      "display-options-sensible",
    );
    expect(nonSensibleList).toHaveAttribute(
      "data-testid",
      "display-options-not-sensible",
    );
  });

  it("calls onSelectVisualization when a sensible visualization is clicked and was not already selected", async () => {
    const { onSelectVisualization } = setup({ selectedVisualization: "line" });
    await userEvent.click(getIcon("bar"));
    expect(onSelectVisualization).toHaveBeenCalledWith("bar");
  });

  it("calls onSelectVisualization when a non-sensible visualization is selected", async () => {
    const { onSelectVisualization } = setup();
    await userEvent.click(getIcon("pie"));
    expect(onSelectVisualization).toHaveBeenCalledWith("pie");
  });
});
