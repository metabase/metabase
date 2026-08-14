import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { AreaNavButton } from "./AreaNavButton";

function setup() {
  const onClick = jest.fn();

  renderWithProviders(
    <AreaNavButton label="New embed" icon="add" showLabel onClick={onClick} />,
  );

  return { onClick };
}

describe("AreaNavButton", () => {
  it("is a button rather than a link, since it goes nowhere", async () => {
    const { onClick } = setup();

    const button = screen.getByRole("button", { name: "New embed" });

    expect(
      screen.queryByRole("link", { name: "New embed" }),
    ).not.toBeInTheDocument();
    expect(button).not.toHaveAttribute("aria-current");

    await userEvent.click(button);

    expect(onClick).toHaveBeenCalled();
  });
});
