import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import type {
  ChartSettingSegmentedControlOption,
  ChartSettingSegmentedControlProps,
} from "metabase/viz-core";

import { ChartSettingSegmentedControl } from "./ChartSettingSegmentedControl";

interface SetupOpts {
  options: ChartSettingSegmentedControlOption[];
  value: ChartSettingSegmentedControlProps["value"];
}

function setup({ options, value }: SetupOpts) {
  const onChange = jest.fn<
    void,
    [ChartSettingSegmentedControlProps["value"]]
  >();
  render(
    <ChartSettingSegmentedControl
      options={options}
      value={value}
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe("ChartSettingSegmentedControl", () => {
  it("should show the selected option and report the clicked one", async () => {
    const { onChange } = setup({
      options: [
        { name: "Auto", value: "auto" },
        { name: "Compact", value: "compact" },
        { name: "Full", value: "full" },
      ],
      value: "auto",
    });

    expect(screen.getByRole("radio", { name: "Auto" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Compact" })).not.toBeChecked();

    await userEvent.click(screen.getByText("Compact"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("compact");
  });

  it("should support boolean and null option values", async () => {
    const { onChange } = setup({
      options: [
        { name: "Auto", value: null },
        { name: "On", value: true },
        { name: "Off", value: false },
      ],
      value: false,
    });

    expect(screen.getByRole("radio", { name: "Off" })).toBeChecked();

    await userEvent.click(screen.getByText("On"));
    expect(onChange).toHaveBeenLastCalledWith(true);

    await userEvent.click(screen.getByText("Auto"));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("should name icon options by their name without a tooltip", async () => {
    setup({
      options: [
        { name: "Solid", value: "solid", icon: "line_style_solid" },
        { name: "Dashed", value: "dashed", icon: "line_style_dashed" },
      ],
      value: "solid",
    });

    expect(screen.getByRole("radio", { name: "Solid" })).toBeChecked();

    await userEvent.hover(screen.getByRole("img", { name: "Dashed" }));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
