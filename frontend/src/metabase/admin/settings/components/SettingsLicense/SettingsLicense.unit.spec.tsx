import { renderWithProviders, screen } from "__support__/ui";

import SettingsLicense from "./SettingsLicense";

const setup = () => {
  renderWithProviders(<SettingsLicense />);
};

describe("SettingsLicense", () => {
  it("should add utm_media to the upgrade link", () => {
    setup();

    expect(
      screen.getByRole("link", { name: "Explore our paid plans" }),
    ).toHaveAttribute("href", expect.stringContaining("license"));
  });
});
