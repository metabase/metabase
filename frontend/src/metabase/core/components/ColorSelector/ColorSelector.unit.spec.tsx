import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ColorSelector from "./ColorSelector";

const user = userEvent.setup();

describe("ColorSelector", () => {
  it("should select a color in a popover", async () => {
    const onChange = jest.fn();

    render(
      <ColorSelector
        value="white"
        colors={["blue", "green"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText("white"));
    const tooltip = await screen.findByRole("tooltip");
    await user.click(within(tooltip).getByLabelText("blue"));

    expect(onChange).toHaveBeenCalledWith("blue");
  });
});
