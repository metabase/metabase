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
  const onOpenSettings = jest.fn();
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
      onOpenSettings={onOpenSettings}
    />,
  );

  return {
    onSelectVisualization,
    onOpenSettings,
  };
};

describe("ChartTypeSettings", () => {
  it("renders the sensible visualizations and a `More charts` toggle", () => {
    setup();
    expect(screen.getByTestId("display-options-sensible")).toBeInTheDocument();
    expect(screen.getByText("More charts")).toBeInTheDocument();
  });

  it("collapses the More charts section by default when selected viz is sensible", () => {
    setup({ selectedVisualization: "bar" });
    expect(
      screen.getByRole("button", { name: /more charts/i }),
    ).toBeInTheDocument();
    expect(getIcon("chevrondown")).toBeInTheDocument();
  });

  it("expands the More charts section by default when selected viz is non-sensible", () => {
    setup({ selectedVisualization: "pie" });
    expect(getIcon("chevronup")).toBeInTheDocument();
    expect(
      screen.getByTestId("display-options-not-sensible"),
    ).toBeInTheDocument();
  });

  it("toggles the More charts section when the header is clicked", async () => {
    setup({ selectedVisualization: "bar" });
    expect(getIcon("chevrondown")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /more charts/i }));
    expect(getIcon("chevronup")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /more charts/i }));
    expect(getIcon("chevrondown")).toBeInTheDocument();
  });

  it("passes correct props to ChartTypeLists", () => {
    setup({ selectedVisualization: "pie" });
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

  it("calls onOpenSettings when a sensible visualization is clicked and was not already selected", async () => {
    const { onOpenSettings } = setup({ selectedVisualization: "line" });
    await userEvent.click(getIcon("line"));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("calls onSelectVisualization when a non-sensible visualization is selected", async () => {
    const { onSelectVisualization } = setup({
      selectedVisualization: "pie",
    });
    await userEvent.click(getIcon("bubble"));
    expect(onSelectVisualization).toHaveBeenCalledWith("scatter");
  });
});
