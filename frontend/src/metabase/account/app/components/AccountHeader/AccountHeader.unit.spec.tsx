import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import type { User } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { AccountHeader } from "./AccountHeader";

const getUser = (opts?: Partial<User>) =>
  createMockUser({
    id: 1,
    first_name: "John",
    last_name: "Doe",
    email: "john@metabase.test",
    ...opts,
  });

type SetupOpts = {
  user?: User;
  isMfaEnabled?: boolean;
};

function setup({ user = getUser(), isMfaEnabled = false }: SetupOpts = {}) {
  const onChangeLocation = jest.fn();

  renderWithProviders(
    <AccountHeader user={user} onChangeLocation={onChangeLocation} />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "mfa-enforcement": isMfaEnabled ? "optional" : "off",
        }),
      }),
    },
  );

  return { onChangeLocation };
}

describe("AccountHeader", () => {
  it("should show all tabs for a regular user", () => {
    setup();

    expect(screen.getByRole("tab", { name: "Profile" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Authentication" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Login History" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Notifications" }),
    ).toBeInTheDocument();
  });

  it("should change location when a tab is selected", () => {
    const { onChangeLocation } = setup();

    fireEvent.click(screen.getByRole("tab", { name: "Profile" }));
    expect(onChangeLocation).toHaveBeenCalledWith("/account/profile");
  });

  describe("authentication tab", () => {
    it("should show the tab for a user who can change their password", () => {
      setup({ user: getUser({ sso_source: null }) });

      expect(
        screen.getByRole("tab", { name: "Authentication" }),
      ).toBeInTheDocument();
    });

    it("should show the tab for a password user when two-factor authentication is disabled for the instance", () => {
      setup({ user: getUser({ sso_source: null }), isMfaEnabled: false });

      expect(
        screen.getByRole("tab", { name: "Authentication" }),
      ).toBeInTheDocument();
    });

    it("should hide the tab for an SSO user who cannot enroll in two-factor authentication", () => {
      setup({ user: getUser({ sso_source: "google" }) });

      expect(
        screen.queryByRole("tab", { name: "Authentication" }),
      ).not.toBeInTheDocument();
    });

    it("should hide the tab for an SSO user even when two-factor authentication is enabled for the instance", () => {
      setup({ user: getUser({ sso_source: "google" }), isMfaEnabled: true });

      expect(
        screen.queryByRole("tab", { name: "Authentication" }),
      ).not.toBeInTheDocument();
    });

    it("should show the tab for an LDAP user when two-factor authentication is enabled for the instance", () => {
      setup({ user: getUser({ sso_source: "ldap" }), isMfaEnabled: true });

      expect(
        screen.getByRole("tab", { name: "Authentication" }),
      ).toBeInTheDocument();
    });

    it("should hide the tab for an LDAP user when two-factor authentication is disabled for the instance", () => {
      setup({ user: getUser({ sso_source: "ldap" }), isMfaEnabled: false });

      expect(
        screen.queryByRole("tab", { name: "Authentication" }),
      ).not.toBeInTheDocument();
    });
  });
});
