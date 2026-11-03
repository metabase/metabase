import userEvent from "@testing-library/user-event";

import { createMockSettingsState, createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";

import { PeopleSettingsMenu } from "./PeopleSettingsMenu";

interface SetupOpts {
  isEmailConfigured: boolean;
}

const setup = ({ isEmailConfigured }: SetupOpts) => {
  renderWithProviders(<PeopleSettingsMenu />, {
    storeInitialState: createMockState({
      settings: createMockSettingsState({
        "email-configured?": isEmailConfigured,
      }),
    }),
  });
};

describe("PeopleSettingsMenu (without tenants)", () => {
  it("offers only the force password reset when email is set up", async () => {
    setup({ isEmailConfigured: true });

    await userEvent.click(
      screen.getByRole("button", { name: "People settings" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Force password reset" }),
    ).toHaveAttribute("href", "/admin/people/force-reset");
    expect(
      screen.queryByRole("menuitem", { name: "Pick a user strategy" }),
    ).not.toBeInTheDocument();
  });

  it("shows no menu when email is not set up, since it would be empty", () => {
    setup({ isEmailConfigured: false });

    expect(
      screen.queryByRole("button", { name: "People settings" }),
    ).not.toBeInTheDocument();
  });
});
