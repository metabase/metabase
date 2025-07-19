import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { BadgeListItem } from "./BadgeListItem";

const setup = () => {
  const name = "test badge";
  const onSelectItem = jest.fn();
  const onRemoveItem = jest.fn();
  render(
    <BadgeListItem
      name={name}
      onClick={onSelectItem}
      onRemoveItem={onRemoveItem}
    />,
  );
  return { onSelectItem, onRemoveItem };
};

describe("BadgeListItem", () => {
  it("renders badge with correct name", () => {
    setup();
    expect(screen.getByText("test badge")).toBeInTheDocument();
  });

  it("calls onSelectItem when badge is clicked", async () => {
    const { onSelectItem } = setup();
    await userEvent.click(screen.getByText("test badge"));
    expect(onSelectItem).toHaveBeenCalledTimes(1);
  });

  it("prevents badge click event when clicking remove button", async () => {
    const { onSelectItem, onRemoveItem } = setup();
    await userEvent.click(screen.getByLabelText("close icon"));
    expect(onRemoveItem).toHaveBeenCalledTimes(1);
    expect(onSelectItem).not.toHaveBeenCalled();
  });

  it("renders close icon", () => {
    setup();
    expect(screen.getByLabelText("close icon")).toBeInTheDocument();
  });
});
