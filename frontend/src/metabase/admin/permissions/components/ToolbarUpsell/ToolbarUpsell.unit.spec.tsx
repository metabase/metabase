import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import ToolbarUpsell from "./ToolbarUpsell";

const setup = () => {
  renderWithProviders(<ToolbarUpsell />);
};

describe("ToolbarUpsell", () => {
  it("should add utm_media to the upgrade link", async () => {
    setup();

    await userEvent.click(screen.getByText("Get more control"));

    expect(
      screen.getByRole("link", { name: "Upgrade to Pro or Enterprise" }),
    ).toHaveAttribute("href", expect.stringContaining("permissions_top"));
  });
});
