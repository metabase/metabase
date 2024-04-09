import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Color from "color";
import { useState } from "react";

import ColorPicker from "./ColorPicker";

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
});
