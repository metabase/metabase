import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";

import { ColorSelector } from "./ColorSelector";

const pickColor = async (label: string) => {
  await userEvent.click(screen.getByLabelText("white"));
  const tooltip = await screen.findByRole("dialog");
  await userEvent.click(within(tooltip).getByLabelText(label));
};

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

    await pickColor("blue");

    expect(onChange).toHaveBeenCalledWith("blue", undefined);
  });

  it("should report the palette name of the color that was picked", async () => {
    const onChange = jest.fn();

    render(
      <ColorSelector
        value="white"
        colors={[
          { name: "accent0", value: "blue" },
          { name: "accent1", value: "green" },
        ]}
        onChange={onChange}
      />,
    );

    await pickColor("green");

    expect(onChange).toHaveBeenCalledWith("green", "accent1");
  });
});
