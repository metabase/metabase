import { mockSettings } from "__support__/settings";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import type { User } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { AccountHeader } from "./AccountHeader";

const getUser = () =>
  createMockUser({
    id: 1,
    first_name: "John",
    last_name: "Doe",
    email: "john@metabase.test",
    sso_source: "google",
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
  const ORIGINAL_PLUGIN_IS_PASSWORD_USER = [...PLUGIN_IS_PASSWORD_USER];

  beforeEach(() => {
    PLUGIN_IS_PASSWORD_USER.splice(0);
  });

  afterEach(() => {
    PLUGIN_IS_PASSWORD_USER.splice(
      0,
      PLUGIN_IS_PASSWORD_USER.length,
      ...ORIGINAL_PLUGIN_IS_PASSWORD_USER,
    );
  });

  it("should show all tabs for a regular user", () => {
    setup();

    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Login History")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
  });

  it("should show the password tab if it is enabled by a plugin", () => {
    PLUGIN_IS_PASSWORD_USER.push((user) => user.sso_source === "google");

    setup();

    expect(screen.getByText("Password")).toBeInTheDocument();
  });

  it("should hide the password tab if it is disabled by a plugin", () => {
    PLUGIN_IS_PASSWORD_USER.push((user) => user.sso_source !== "google");

    setup();

    expect(screen.queryByText("Password")).not.toBeInTheDocument();
  });

  describe("security tab", () => {
    it("should show the tab when two-factor authentication is enabled for the instance", () => {
      setup({ isMfaEnabled: true });

      expect(screen.getByText("Security")).toBeInTheDocument();
    });

    it("should hide the tab when two-factor authentication is disabled for the instance", () => {
      setup({ isMfaEnabled: false });

      expect(screen.queryByText("Security")).not.toBeInTheDocument();
    });
  });

  it("should change location when a tab is selected", () => {
    const { onChangeLocation } = setup();

    fireEvent.click(screen.getByText("Profile"));
    expect(onChangeLocation).toHaveBeenCalledWith("/account/profile");
  });
});
