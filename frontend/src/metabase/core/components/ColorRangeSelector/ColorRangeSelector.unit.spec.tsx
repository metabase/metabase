import { render, screen } from "@testing-library/react";

import { color } from "metabase/lib/colors";

import ColorRangeSelector from "./ColorRangeSelector";
import { getColorRangeLabel } from "./ColorRangeToggle";

const DEFAULT_VALUE = [color("white"), color("brand")];
const DEFAULT_COLORS = [color("brand"), color("summarize"), color("filter")];

const WHITE_COLOR_RANGE = [color("error"), color("white"), color("success")];
const WARNING_COLOR_RANGE = [
  color("error"),
  color("warning"),
  color("success"),
];

function setup() {
  const onChange = jest.fn();
  render(
    <ColorRangeSelector
      value={DEFAULT_VALUE}
      colors={DEFAULT_COLORS}
      colorRanges={[WHITE_COLOR_RANGE, WARNING_COLOR_RANGE]}
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe("ColorRangeSelector", () => {
  it("should call `onChange` upon clicking a color", async () => {
    const { onChange } = setup();

    screen.getByRole("button").click();
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    (await screen.findByLabelText(color("summarize"))).click();
    expect(onChange).toHaveBeenCalled();

    screen.getByLabelText(color("filter")).click();
    expect(onChange).toHaveBeenCalled();
  });

  it("should call `onChange` upon clicking a non-initial range", async () => {
    const { onChange } = setup();

    screen.getByRole("button").click();
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    (await screen.findByLabelText(getColorRangeLabel(DEFAULT_VALUE))).click();
    expect(onChange).not.toHaveBeenCalled();

    (
      await screen.findByLabelText(getColorRangeLabel(WHITE_COLOR_RANGE))
    ).click();
    expect(onChange).toHaveBeenCalled();

    (
      await screen.findByLabelText(getColorRangeLabel(WARNING_COLOR_RANGE))
    ).click();
    expect(onChange).toHaveBeenCalled();
  });
});
