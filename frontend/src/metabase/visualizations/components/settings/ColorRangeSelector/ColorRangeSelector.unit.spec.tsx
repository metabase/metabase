import userEvent from "@testing-library/user-event";
import Color from "color";

import { render, screen } from "__support__/ui";
import { color as libColors } from "metabase/ui/colors";

import { ColorRangeSelector } from "./ColorRangeSelector";
import { getColorRangeLabel } from "./ColorRangeToggle";

// Color components only speak hex, so we need to convert the values we use for testing to hex
const color = (name: string) => Color(libColors(name)).hex();

const DEFAULT_VALUE = [color("core-white"), color("core-brand")];
const DEFAULT_COLORS = [
  color("core-brand"),
  color("core-summarize"),
  color("core-filter"),
];

const WHITE_COLOR_RANGE = [
  color("feedback-negative"),
  color("core-white"),
  color("feedback-positive"),
];
const WARNING_COLOR_RANGE = [
  color("feedback-negative"),
  color("feedback-warning"),
  color("feedback-positive"),
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

    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await userEvent.click(
      await screen.findByLabelText(color("core-summarize")),
    );
    expect(onChange).toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText(color("core-filter")));
    expect(onChange).toHaveBeenCalled();
  });

  it("should call `onChange` upon clicking a non-initial range", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await userEvent.click(
      await screen.findByLabelText(getColorRangeLabel(DEFAULT_VALUE)),
    );
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(
      await screen.findByLabelText(getColorRangeLabel(WHITE_COLOR_RANGE)),
    );
    expect(onChange).toHaveBeenCalled();

    await userEvent.click(
      await screen.findByLabelText(getColorRangeLabel(WARNING_COLOR_RANGE)),
    );
    expect(onChange).toHaveBeenCalled();
  });
});
