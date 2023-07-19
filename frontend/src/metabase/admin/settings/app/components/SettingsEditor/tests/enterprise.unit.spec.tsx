import userEvent from "@testing-library/user-event";
import {
  createMockGroup,
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setupGroupsEndpoint } from "__support__/server-mocks";
import { setup, SetupOpts } from "./setup";

const setupEnterprise = (opts?: SetupOpts) => {
  setup({ ...opts, hasEnterprisePlugins: true });
};

describe("SettingsEditor", () => {
  it("should not allow to configure the origin for full-app embedding", async () => {
    setupEnterprise({
      settings: [
        createMockSettingDefinition({ key: "enable-embedding" }),
        createMockSettingDefinition({ key: "embedding-app-origin" }),
      ],
      settingValues: createMockSettings({ "enable-embedding": true }),
    });

    userEvent.click(await screen.findByText("Embedding"));
    userEvent.click(screen.getByText("Full-app embedding"));
    expect(screen.getByText(/some of our paid plans/)).toBeInTheDocument();
    expect(screen.queryByText("Authorized origins")).not.toBeInTheDocument();
  });

  it("should not allow to toggle off password login", async () => {
    setupEnterprise({
      settings: [
        createMockSettingDefinition({ key: "enable-password-login" }),
        createMockSettingDefinition({ key: "google-auth-enabled" }),
      ],
      settingValues: createMockSettings({
        "enable-password-login": true,
        "google-auth-enabled": true,
      }),
    });

    userEvent.click(await screen.findByText("Authentication"));
    expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
    expect(
      screen.queryByText("Enable Password Authentication"),
    ).not.toBeInTheDocument();
  });

  describe("authentication", () => {
    it("should not show JWT and SAML auth options", async () => {
      setupEnterprise({ initialRoute: "/admin/settings/authentication" });

      expect(
        await screen.findByText("Sign in with Google"),
      ).toBeInTheDocument();

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
      setupEnterprise({ initialRoute: "/admin/settings/authentication/jwt" });
      expect(
        await screen.findByText("We're a little lost..."),
      ).toBeInTheDocument();
    });

    it("should not let users access SAML settings", async () => {
      setupEnterprise({ initialRoute: "/admin/settings/authentication/saml" });
      expect(
        await screen.findByText("We're a little lost..."),
      ).toBeInTheDocument();
    });

    it("should not show the session timeout option", async () => {
      setupEnterprise({
        initialRoute: "/admin/settings/authentication",
      });

      expect(
        await screen.findByText("Sign in with Google"),
      ).toBeInTheDocument();

      expect(screen.queryByText("Session timeout")).not.toBeInTheDocument();
    });

    it("should not show the advanced LDAP settings", async () => {
      setupGroupsEndpoint([createMockGroup()]);
      setupEnterprise({
        initialRoute: "/admin/settings/authentication/ldap",
      });

      expect(await screen.findByText("Server Settings")).toBeInTheDocument();
      expect(
        screen.queryByText("Group membership filter"),
      ).not.toBeInTheDocument();
    });

    it("show a single domain input", async () => {
      setupEnterprise({
        initialRoute: "/admin/settings/authentication/google",
      });

      expect(
        await screen.findByText("Sign in with Google"),
      ).toBeInTheDocument();
      expect(
        await screen.findByText(
          "Allow users to sign up on their own if their Google account email address is from:",
        ),
      ).toBeInTheDocument();
      expect(
        await screen.findByPlaceholderText("mycompany.com"),
      ).toBeInTheDocument();
    });
  });
});
