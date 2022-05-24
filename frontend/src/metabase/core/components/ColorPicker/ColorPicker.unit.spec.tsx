import React, { useState } from "react";
import Color from "color";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ColorPicker from "./ColorPicker";

const TestColorPicker = () => {
  const [color, setColor] = useState("white");
  return <ColorPicker color={color} onChange={setColor} />;
};

describe("ColorPicker", () => {
  it("should input a color inline", () => {
    render(<TestColorPicker />);

    const color = Color.rgb(0, 0, 0);
    const input = screen.getByRole("textbox");
    userEvent.clear(input);
    userEvent.type(input, color.hex());

    expect(screen.getByLabelText(color.hex())).toBeInTheDocument();
  });

  it("should input a color in a popover", async () => {
    render(<TestColorPicker />);
    userEvent.click(screen.getByLabelText("white"));

    const color = Color.rgb(0, 0, 0);
    const tooltip = await screen.findByRole("tooltip");
    const input = within(tooltip).getByRole("textbox");
    userEvent.clear(input);
    userEvent.type(input, color.hex());

    expect(screen.getByLabelText(color.hex())).toBeInTheDocument();
  });
});
