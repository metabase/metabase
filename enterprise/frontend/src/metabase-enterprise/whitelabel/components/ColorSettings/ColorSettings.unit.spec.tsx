import userEvent from "@testing-library/user-event";
import Color from "color";

import { render, screen } from "__support__/ui";
import { colors, staticVizOverrides } from "metabase/lib/colors/colors";
import { color } from "metabase/lib/colors/palette";

import { ColorSettings } from "./ColorSettings";

describe("ColorSettings", () => {
  const textMediumHex = Color(
    color("text-secondary", staticVizOverrides),
  ).hex();
  const textLightHex = Color(color("text-tertiary", staticVizOverrides)).hex();

  const initialColors = {
    brand: color("filter"),
    accent1: textMediumHex,
  };

  it("should update brand colors", async () => {
    const onChange = jest.fn();

    render(
      <ColorSettings
        initialColors={initialColors}
        themeColors={colors}
        onChange={onChange}
      />,
    );

    const input = screen.getByPlaceholderText(Color(color("summarize")).hex());
    await userEvent.clear(input);
    await userEvent.type(input, color("error"));

    expect(onChange).toHaveBeenLastCalledWith({
      brand: color("filter"),
      /* Needs to convert this to hex because the input is transform to hex,
       * but we want to use hsla for our new colors, this is to allow better text search. */
      summarize: Color(color("error")).hex(),
      accent1: textMediumHex,
    });
  });

  it("should update chart colors", async () => {
    const onChange = jest.fn();

    render(
      <ColorSettings
        initialColors={initialColors}
        themeColors={colors}
        onChange={onChange}
      />,
    );

    const input = screen.getByDisplayValue(textMediumHex);
    await userEvent.clear(input);
    await userEvent.type(input, textLightHex);

    expect(onChange).toHaveBeenLastCalledWith({
      brand: color("filter"),
      accent1: textLightHex,
    });
  });

  it("should reset chart colors", async () => {
    const onChange = jest.fn();

    render(
      <ColorSettings
        initialColors={initialColors}
        themeColors={colors}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByText("Reset to default colors"));
    await userEvent.click(screen.getByText("Reset"));

    expect(onChange).toHaveBeenLastCalledWith({
      brand: color("filter"),
    });
  });

  it("should generate chart colors", async () => {
    const onChange = jest.fn();

    render(
      <ColorSettings
        initialColors={initialColors}
        themeColors={colors}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByText("Generate chart colors"));

    expect(onChange).toHaveBeenLastCalledWith({
      brand: color("filter"),
      accent0: expect.any(String),
      accent1: textMediumHex,
      accent2: expect.any(String),
      accent3: expect.any(String),
      accent4: expect.any(String),
      accent5: expect.any(String),
      accent6: expect.any(String),
      accent7: expect.any(String),
    });
  });
});
