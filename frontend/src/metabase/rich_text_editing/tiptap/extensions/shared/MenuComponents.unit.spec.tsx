import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { type MenuItem, MenuItemComponent } from "./MenuComponents";

const BASE_ITEM: MenuItem = {
  icon: "table",
  label: "Orders by product",
  action: jest.fn(),
};

describe("MenuItemComponent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls the item's action on click when not disabled", async () => {
    render(<MenuItemComponent item={BASE_ITEM} />);

    await userEvent.click(
      screen.getByRole("option", { name: /Orders by product/ }),
    );

    expect(BASE_ITEM.action).toHaveBeenCalled();
  });

  it("does not mark an enabled item as disabled", () => {
    render(<MenuItemComponent item={BASE_ITEM} />);

    expect(screen.getByRole("option")).not.toHaveAttribute("aria-disabled");
  });

  it("marks a disabled item with aria-disabled and blocks the click", async () => {
    render(
      <MenuItemComponent
        item={BASE_ITEM}
        isDisabled
        disabledReason="This chart uses a custom visualization, which isn't supported in public links."
      />,
    );

    const option = screen.getByRole("option");
    expect(option).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(option);
    expect(BASE_ITEM.action).not.toHaveBeenCalled();
  });

  it("shows the disabled reason in a tooltip on hover", async () => {
    render(
      <MenuItemComponent
        item={BASE_ITEM}
        isDisabled
        disabledReason="This chart uses a custom visualization, which isn't supported in public links."
      />,
    );

    await userEvent.hover(screen.getByRole("option"));

    expect(
      await screen.findByText(
        "This chart uses a custom visualization, which isn't supported in public links.",
      ),
    ).toBeInTheDocument();
  });

  it("also blocks a caller-provided onClick handler when disabled", async () => {
    const onClick = jest.fn();

    render(
      <MenuItemComponent
        item={BASE_ITEM}
        isDisabled
        disabledReason="blocked"
        onClick={onClick}
      />,
    );

    await userEvent.click(screen.getByRole("option"));

    expect(onClick).not.toHaveBeenCalled();
    expect(BASE_ITEM.action).not.toHaveBeenCalled();
  });
});
