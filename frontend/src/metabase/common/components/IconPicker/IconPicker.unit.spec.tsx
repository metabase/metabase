import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "__support__/ui";

import { IconPicker } from "./IconPicker";

const setup = ({ value = null }: { value?: "star" | null } = {}) => {
  const onChange = jest.fn();
  render(<IconPicker value={value} onChange={onChange} />);
  return { onChange };
};

const openPicker = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Icon" }));
  expect(await screen.findByRole("button", { name: "folder" })).toBeVisible();
};

describe("IconPicker", () => {
  it("calls onChange with the picked icon and closes the popover", async () => {
    const { onChange } = setup();

    await openPicker();
    await userEvent.click(screen.getByRole("button", { name: "star" }));

    expect(onChange).toHaveBeenCalledWith("star");
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText("Search icons…"),
      ).not.toBeInTheDocument();
    });
  });

  it("narrows the grid to icons matching the search term", async () => {
    setup();

    await openPicker();
    await userEvent.type(screen.getByPlaceholderText("Search icons…"), "fold");

    expect(screen.getByRole("button", { name: "folder" })).toBeVisible();
    expect(screen.getByRole("button", { name: "open_folder" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "star" }),
    ).not.toBeInTheDocument();
  });

  it("clears the icon when resetting to the default", async () => {
    const { onChange } = setup({ value: "star" });

    await openPicker();
    await userEvent.click(screen.getByRole("button", { name: "Default" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
