import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";
import { color } from "metabase/ui/colors";

import { ChartSettingColorPicker } from "./ChartSettingColorPicker";

const pickAccent1 = async () => {
  await userEvent.click(screen.getByLabelText(color("brand")));
  const popover = await screen.findByRole("dialog");
  await userEvent.click(within(popover).getByLabelText(color("accent1")));
};

describe("ChartSettingColorPicker", () => {
  it("should not report the palette color name by default", async () => {
    const onChange = jest.fn();

    render(
      <ChartSettingColorPicker value={color("brand")} onChange={onChange} />,
    );

    await pickAccent1();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(color("accent1"), undefined);
  });

  it("should report the palette color name with forwardColorName", async () => {
    const onChange = jest.fn();

    render(
      <ChartSettingColorPicker
        value={color("brand")}
        forwardColorName
        onChange={onChange}
      />,
    );

    await pickAccent1();

    expect(onChange).toHaveBeenCalledWith(color("accent1"), "accent1");
  });
});
