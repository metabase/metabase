import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ColorSelector from "./ColorSelector";

describe("ColorSelector", () => {
  it("should select a color in a popover", async () => {
    const onChange = jest.fn();

    render(
      <ColorSelector
        color="white"
        colors={["blue", "green"]}
        onChange={onChange}
      />,
    );

    userEvent.click(screen.getByLabelText("white"));
    userEvent.click(await screen.findByLabelText("blue"));

    expect(onChange).toHaveBeenCalledWith("blue");
  });
});
