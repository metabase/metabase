import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { BadgeList, type BadgeListProps } from "./BadgeList";

type SetupOpts = Partial<BadgeListProps<{ id: number }>>;

const setup = (opts: SetupOpts = {}) => {
  const items = [
    { name: "item1", item: { id: 1 } },
    { name: "item2", item: { id: 2 } },
  ];
  const onSelectItem = jest.fn();
  const onAddItem = jest.fn();
  const onRemoveItem = jest.fn();
  const addButtonLabel =
    "addButtonLabel" in opts ? opts.addButtonLabel : "Add new";

  render(
    <BadgeList
      items={items}
      onSelectItem={onSelectItem}
      onRemoveItem={onRemoveItem}
      onAddItem={onAddItem}
      addButtonLabel={addButtonLabel}
    />,
  );

  return {
    onSelectItem,
    onAddItem,
    onRemoveItem,
  };
};

describe("BadgeList", () => {
  it("renders all items", () => {
    setup();
    expect(screen.getByText("item1")).toBeInTheDocument();
    expect(screen.getByText("item2")).toBeInTheDocument();
  });

  it("renders add button when label is provided", () => {
    setup();
    expect(screen.getByText("Add new")).toBeInTheDocument();
  });

  it("doesn't render add button when label is not provided", () => {
    setup({ addButtonLabel: undefined });
    expect(screen.queryByText("Add new")).not.toBeInTheDocument();
  });

  it("calls onSelectItem with correct item when badge is clicked", async () => {
    const { onSelectItem } = setup();
    await userEvent.click(screen.getByText("item1"));
    expect(onSelectItem).toHaveBeenCalledWith({ id: 1 }, 0);
  });

  it("calls onRemoveItem with correct item when remove button is clicked", async () => {
    const { onRemoveItem } = setup();
    const removeButtons = screen.getAllByLabelText("close icon");
    await userEvent.click(removeButtons[0]);
    expect(onRemoveItem).toHaveBeenCalledWith({ id: 1 }, 0);
  });

  it("calls onAddItem when add button is clicked", async () => {
    const { onAddItem } = setup();
    await userEvent.click(screen.getByText("Add new"));
    expect(onAddItem).toHaveBeenCalled();
  });
});
