import userEvent from "@testing-library/user-event";
import Color from "color";

import { render, screen } from "__support__/ui";
import { colors } from "metabase/ui/colors/colors";
import { color } from "metabase/ui/colors/palette";
import type { ColorSettings as ColorSettingsType } from "metabase-types/api";

import { ColorSettings } from "./ColorSettings";

const BRAND = "#123456";
const ACCENT1 = "#2A9D8F";
const NEW_ACCENT1 = "#E76F51";
const NEW_SUMMARIZE = "#8E44AD";

const DEFAULT_COLORS = {
  brand: BRAND,
  accent1: ACCENT1,
};

interface SetupOpts {
  initialColors?: ColorSettingsType;
}

const setup = ({ initialColors = DEFAULT_COLORS }: SetupOpts = {}) => {
  const onChange = jest.fn();

  render(
    <ColorSettings
      initialColors={initialColors}
      themeColors={colors}
      onChange={onChange}
    />,
  );

  return { onChange };
};

describe("ColorSettings", () => {
  it("should update brand colors", async () => {
    const { onChange } = setup();

    const input = screen.getByPlaceholderText(
      Color(color("core-summarize")).hex(),
    );
    await userEvent.clear(input);
    await userEvent.type(input, NEW_SUMMARIZE);

    expect(onChange).toHaveBeenLastCalledWith({
      brand: BRAND,
      summarize: NEW_SUMMARIZE,
      accent1: ACCENT1,
    });
  });

  it("should drop the key when a brand color is cleared", async () => {
    const { onChange } = setup();

    await userEvent.clear(screen.getByDisplayValue(BRAND));

    expect(onChange).toHaveBeenLastCalledWith({ accent1: ACCENT1 });
  });

  it("should update chart colors", async () => {
    const { onChange } = setup();

    const input = screen.getByDisplayValue(ACCENT1);
    await userEvent.clear(input);
    await userEvent.type(input, NEW_ACCENT1);

    expect(onChange).toHaveBeenLastCalledWith({
      brand: BRAND,
      accent1: NEW_ACCENT1,
    });
  });

  it("should reset chart colors", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByText("Reset to default colors"));
    await userEvent.click(screen.getByText("Reset"));

    expect(onChange).toHaveBeenLastCalledWith({ brand: BRAND });
  });

  it("should generate chart colors", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByText("Generate chart colors"));

    expect(onChange).toHaveBeenLastCalledWith({
      brand: BRAND,
      accent0: expect.any(String),
      accent1: ACCENT1,
      accent2: expect.any(String),
      accent3: expect.any(String),
      accent4: expect.any(String),
      accent5: expect.any(String),
      accent6: expect.any(String),
      accent7: expect.any(String),
    });
  });
});
