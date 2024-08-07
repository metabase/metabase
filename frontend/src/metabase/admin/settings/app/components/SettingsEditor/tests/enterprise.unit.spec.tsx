import "metabase/plugins/builtin";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupGroupsEndpoint } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import {
  createMockGroup,
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup, EMAIL_URL } from "./setup";

const setupEnterprise = async (opts?: SetupOpts) => {
  await setup({ ...opts, hasEnterprisePlugins: true });
};

describe("SettingsEditor", () => {
  it("shows notify admin of new users provisioned options", async () => {
    fetchMock.get("path:/api/ee/scim/api_key", 404);

    await setupEnterprise({
      initialRoute: "/admin/settings/authentication/user-provisioning",
      settings: [
        createMockSettingDefinition({ key: "saml-enabled", value: true }),
      ],
      settingValues: createMockSettings({ "saml-enabled": true }),
      tokenFeatures: createMockTokenFeatures({ scim: true, sso_saml: true }),
    });

    expect(
      await screen.findByText(
        "Notify admins of new users provisioned from SSO",
      ),
    ).toBeInTheDocument();
  });

  it("should not allow to configure the origin and SameSite cookie for interactive embedding", async () => {
    await setupEnterprise({
      settings: [
        createMockSettingDefinition({ key: "enable-embedding" }),
        createMockSettingDefinition({ key: "embedding-app-origin" }),
      ],
      settingValues: createMockSettings({ "enable-embedding": true }),
    });

    await userEvent.click(screen.getByText("Embedding"));
    await userEvent.click(screen.getByText("Interactive embedding"));
    expect(screen.queryByText("Authorized origins")).not.toBeInTheDocument();
    expect(
      screen.queryByText("SameSite cookie setting"),
    ).not.toBeInTheDocument();
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

    await userEvent.click(screen.getByText("Authentication"));
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
          createMockSettingDefinition({ key: "email-configured?" }),
        ],
        settingValues: createMockSettings({
          "subscription-allowed-domains": "somedomain.com",
          "email-configured?": true,
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
        settings: [
          createMockSettingDefinition({ key: "user-visibility" }),
          createMockSettingDefinition({ key: "email-configured?" }),
        ],
        settingValues: createMockSettings({
          "user-visibility": "all",
          "email-configured?": true,
        }),
        initialRoute: EMAIL_URL,
      });

      expect(
        screen.queryByText(
          /suggest recipients on dashboard subscriptions and alerts/i,
        ),
      ).not.toBeInTheDocument();
    });
  });

  describe("SMTP configuration", () => {
    it("should be visible with self-hosted email", async () => {
      await setupEnterprise({
        settings: [
          createMockSettingDefinition({ key: "user-visibility" }),
          createMockSettingDefinition({ key: "email-configured?" }),
          createMockSettingDefinition({ key: "is-hosted?" }),
        ],
        settingValues: createMockSettings({
          "user-visibility": "all",
          "email-configured?": true,
          "is-hosted?": false,
        }),
        initialRoute: EMAIL_URL,
      });

      expect(screen.getByTestId("smtp-connection-card")).toBeInTheDocument();
    });

    it("should not be visible with cloud-hosted email", async () => {
      await setupEnterprise({
        settings: [
          createMockSettingDefinition({ key: "user-visibility" }),
          createMockSettingDefinition({ key: "email-configured?" }),
          createMockSettingDefinition({ key: "is-hosted?" }),
        ],
        settingValues: createMockSettings({
          "user-visibility": "all",
          "email-configured?": true,
          "is-hosted?": true,
        }),
        initialRoute: EMAIL_URL,
      });

      expect(
        screen.queryByTestId("smtp-connection-card"),
      ).not.toBeInTheDocument();
    });
  });
});
