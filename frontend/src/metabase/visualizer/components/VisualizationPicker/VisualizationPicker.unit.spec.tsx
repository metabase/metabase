import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { VisualizationDisplay } from "metabase-types/api";

import { trackVisualizerDataChanged } from "../analytics";

import { VisualizationPicker } from "./VisualizationPicker";

jest.mock("../analytics", () => ({
  trackVisualizerDataChanged: jest.fn(),
}));

registerVisualizations();

interface SetupOpts {
  value: VisualizationDisplay | null;
}

const setup = ({ value }: SetupOpts) => {
  const onChange = jest.fn();

  renderWithProviders(
    <VisualizationPicker value={value} onChange={onChange} />,
  );

  return { onChange };
};

describe("VisualizationPicker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should only list visualizations the visualizer supports", () => {
    setup({ value: "bar" });

    expect(screen.getByRole("radio", { name: "Bar" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Pie" })).not.toBeChecked();
    expect(
      screen.queryByRole("radio", { name: "Table" }),
    ).not.toBeInTheDocument();
  });

  it("should change the visualization and track the change", async () => {
    const { onChange } = setup({ value: "bar" });

    await userEvent.click(screen.getByTestId("pie"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("pie");
    expect(trackVisualizerDataChanged).toHaveBeenCalledWith(
      "visualizer_viz_type_changed",
    );
  });

  it("should select nothing when the value is not a listed visualization", async () => {
    const { onChange } = setup({ value: "table" });

    expect(
      screen.queryByRole("radio", { checked: true }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("radio")[0]);

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
