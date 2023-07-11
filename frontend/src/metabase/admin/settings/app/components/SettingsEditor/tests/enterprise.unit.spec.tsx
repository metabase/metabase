import userEvent from "@testing-library/user-event";
import {
  createMockGroup,
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setupGroupsEndpoint } from "__support__/server-mocks";

import { setup, type SetupOpts, EMAIL_URL } from "./setup";

const setupEnterprise = async (opts?: SetupOpts) => {
  await setup({ ...opts, hasEnterprisePlugins: true });
};

describe("SettingsEditor", () => {
  it("should not allow to configure the origin for full-app embedding", async () => {
    await setupEnterprise({
      settings: [
        createMockSettingDefinition({ key: "enable-embedding" }),
        createMockSettingDefinition({ key: "embedding-app-origin" }),
      ],
      settingValues: createMockSettings({ "enable-embedding": true }),
    });

    userEvent.click(screen.getByText("Embedding"));
    userEvent.click(screen.getByText("Full-app embedding"));
    expect(screen.getByText(/some of our paid plans/)).toBeInTheDocument();
    expect(screen.queryByText("Authorized origins")).not.toBeInTheDocument();
  });

  it("should not allow to toggle off password login", async () => {
    await setupEnterprise({
      settings: [
        createMockSettingDefinition({ key: "enable-password-login" }),
        createMockSettingDefinition({ key: "google-auth-enabled" }),
      ],
      settingValues: createMockSettings({
        "enable-password-login": true,
        "google-auth-enabled": true,
      }),
    });

    userEvent.click(screen.getByText("Authentication"));
    expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
    expect(
      screen.queryByText("Enable Password Authentication"),
    ).not.toBeInTheDocument();
  });

  describe("authentication", () => {
    it("should not show JWT and SAML auth options", async () => {
      await setupEnterprise({ initialRoute: "/admin/settings/authentication" });

      expect(screen.getByText("Sign in with Google")).toBeInTheDocument();

      expect(screen.queryByText("SAML")).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          "Allows users to login via a SAML Identity Provider.",
        ),
      ).not.toBeInTheDocument();

      expect(screen.queryByText("JWT")).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          "Allows users to login via a JWT Identity Provider.",
        ),
      ).not.toBeInTheDocument();
    });

    it("should not let users access JWT settings", async () => {
      await setupEnterprise({
        initialRoute: "/admin/settings/authentication/jwt",
      });
      expect(screen.getByText("We're a little lost...")).toBeInTheDocument();
    });

    it("should not let users access SAML settings", async () => {
      await setupEnterprise({
        initialRoute: "/admin/settings/authentication/saml",
      });
      expect(screen.getByText("We're a little lost...")).toBeInTheDocument();
    });

    it("should not show the session timeout option", async () => {
      await setupEnterprise({
        initialRoute: "/admin/settings/authentication",
      });

      expect(screen.getByText("Sign in with Google")).toBeInTheDocument();

      expect(screen.queryByText("Session timeout")).not.toBeInTheDocument();
    });

    it("should not show the admin sso notification setting", async () => {
      await setupEnterprise({
        initialRoute: "/admin/settings/authentication",
      });

      expect(screen.getByText("Sign in with Google")).toBeInTheDocument();

      expect(
        screen.queryByText("Notify admins of new SSO users"),
      ).not.toBeInTheDocument();
    });

    it("should not show the advanced LDAP settings", async () => {
      setupGroupsEndpoint([createMockGroup()]);
      await setupEnterprise({
        initialRoute: "/admin/settings/authentication/ldap",
      });

      expect(screen.getByText("Server Settings")).toBeInTheDocument();
      expect(
        screen.queryByText("Group membership filter"),
      ).not.toBeInTheDocument();
    });

    it("show a single domain input", async () => {
      await setupEnterprise({
        initialRoute: "/admin/settings/authentication/google",
      });

      expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Allow users to sign up on their own if their Google account email address is from:",
        ),
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText("mycompany.com")).toBeInTheDocument();
    });
  });

  describe("subscription allowed domains", () => {
    it("should not be visible", async () => {
      await setupEnterprise({
        settings: [
          createMockSettingDefinition({ key: "subscription-allowed-domains" }),
        ],
        settingValues: createMockSettings({
          "subscription-allowed-domains": "somedomain.com",
        }),
        initialRoute: EMAIL_URL,
      });

      expect(
        screen.queryByText(/approved domains for notifications/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("subscription user visibility", () => {
    it("should not be visible", async () => {
      await setupEnterprise({
        settings: [createMockSettingDefinition({ key: "user-visibility" })],
        settingValues: createMockSettings({ "user-visibility": "all" }),
        initialRoute: EMAIL_URL,
      });

      expect(
        screen.queryByText(
          /suggest recipients on dashboard subscriptions and alerts/i,
        ),
      ).not.toBeInTheDocument();
    });
  });
});
