import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";

import { ColorSelector } from "./ColorSelector";

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

    await userEvent.click(screen.getByLabelText("white"));
    const tooltip = await screen.findByRole("dialog");
    await userEvent.click(within(tooltip).getByLabelText("blue"));

    expect(onChange).toHaveBeenCalledWith("blue");
  });
});
