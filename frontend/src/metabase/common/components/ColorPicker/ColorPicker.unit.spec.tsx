import userEvent from "@testing-library/user-event";
import Color from "color";
import { useState } from "react";

import { render, screen, within } from "__support__/ui";

import { ColorPicker } from "./ColorPicker";
import { ColorPickerContent } from "./ColorPickerContent";

const TestColorPicker = () => {
  const [value, setValue] = useState("white");
  const handleChange = (value?: string) => setValue(value ?? "white");

  return <ColorPicker value={value} onChange={handleChange} />;
};

describe("ColorPicker", () => {
  it("should input a color inline", async () => {
    render(<TestColorPicker />);

    const color = Color.rgb(0, 0, 0);
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, color.hex());

    expect(screen.getByLabelText(color.hex())).toBeInTheDocument();
  });

  it("should input a color in a popover", async () => {
    render(<TestColorPicker />);
    await userEvent.click(screen.getByLabelText("white"));

    const color = Color.rgb(0, 0, 0);
    const tooltip = await screen.findByRole("tooltip");
    const input = within(tooltip).getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, color.hex());

    expect(screen.getByLabelText(color.hex())).toBeInTheDocument();
  });

  describe("ColorPickerContent showAlpha", () => {
    it("does not render the alpha percentage input by default", () => {
      render(<ColorPickerContent value="#ff0000" onChange={jest.fn()} />);
      expect(
        screen.queryByRole("textbox", { name: "Alpha percentage" }),
      ).not.toBeInTheDocument();
    });

    it("renders the alpha percentage input when showAlpha is set", () => {
      render(
        <ColorPickerContent value="#ff0000" showAlpha onChange={jest.fn()} />,
      );
      const percentInput = screen.getByRole("textbox", {
        name: "Alpha percentage",
      });
      expect(percentInput).toHaveValue("100");
    });

    it("reflects the alpha from an 8-character hex value", () => {
      render(
        <ColorPickerContent value="#ff000080" showAlpha onChange={jest.fn()} />,
      );
      const percentInput = screen.getByRole("textbox", {
        name: "Alpha percentage",
      });
      expect(percentInput).toHaveValue("50");
    });

    it("emits an 8-character hex when alpha is reduced via the percentage input", async () => {
      const onChange = jest.fn();
      render(
        <ColorPickerContent value="#ff0000" showAlpha onChange={onChange} />,
      );

      const percentInput = screen.getByRole("textbox", {
        name: "Alpha percentage",
      });
      await userEvent.clear(percentInput);
      await userEvent.type(percentInput, "50");

      expect(onChange).toHaveBeenLastCalledWith("#ff000080");
    });

    it("preserves alpha when the hex input is edited", async () => {
      const onChange = jest.fn();
      render(
        <ColorPickerContent value="#ff000080" showAlpha onChange={onChange} />,
      );

      const [hexInput] = screen.getAllByRole("textbox");
      await userEvent.clear(hexInput);
      await userEvent.type(hexInput, "#00ff00");

      expect(onChange).toHaveBeenLastCalledWith("#00ff0080");
    });
  });
});
