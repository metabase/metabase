import userEvent from "@testing-library/user-event";
import Color from "color";
import { useState } from "react";

import { act, render, screen, within } from "__support__/ui";

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
    it("does not render the alpha slider by default", () => {
      render(<ColorPickerContent value="#ff0000" onChange={jest.fn()} />);
      expect(
        screen.queryByRole("slider", { name: "Alpha" }),
      ).not.toBeInTheDocument();
    });

    it("renders the alpha slider when showAlpha is set", () => {
      render(
        <ColorPickerContent value="#ff0000" showAlpha onChange={jest.fn()} />,
      );
      expect(screen.getByRole("slider", { name: "Alpha" })).toBeInTheDocument();
    });

    it("emits an 8-character hex when alpha is reduced via the slider", () => {
      const onChange = jest.fn();
      render(
        <ColorPickerContent value="#ff0000" showAlpha onChange={onChange} />,
      );

      const slider = screen.getByRole("slider", { name: "Alpha" });
      jest
        .spyOn(slider, "getBoundingClientRect")
        .mockReturnValue({ left: 0, width: 100 } as DOMRect);

      // Drag to ~50% alpha
      act(() => {
        slider.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, clientX: 50 }),
        );
      });

      expect(onChange).toHaveBeenLastCalledWith("#ff000080");
    });
  });
});
