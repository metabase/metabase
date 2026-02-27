import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupMetabotSlackSettingsEndpoint,
  setupMetabotSlackSettingsEndpointWithError,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupSlackAppInfoEndpoint,
  setupSlackManifestEndpoint,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { SlackAppInfo } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockSlackAppInfo,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { MetabotSlackSetup } from "./MetabotSlackSetup";

const CONFIGURED = {
  clientId: "123.456",
  clientSecret: "secret123",
  signingSecret: "signing123",
} as const;

const MISSING_SCOPES = createMockSlackAppInfo({
  scopes: {
    actual: ["chat:write"],
    required: ["chat:write", "im:history"],
    missing: ["im:history"],
    extra: [],
  },
});

interface SetupOptions {
  isSlackTokenValid?: boolean;
  isEncryptionEnabled?: boolean;
  clientId?: string | null;
  clientSecret?: string | null;
  signingSecret?: string | null;
  isEnabled?: boolean;
  appInfo?: Partial<SlackAppInfo>;
}

const setup = async ({
  isSlackTokenValid = true,
  isEncryptionEnabled = true,
  clientId = null,
  clientSecret = null,
  signingSecret = null,
  isEnabled = false,
  appInfo = {},
}: SetupOptions = {}) => {
  const settings = createMockSettings({
    "slack-token-valid?": isSlackTokenValid,
    "encryption-enabled": isEncryptionEnabled,
    "slack-connect-client-id": clientId,
    "slack-connect-client-secret": clientSecret,
    "metabot-slack-signing-secret": signingSecret,
    "slack-connect-enabled": isEnabled,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "slack-connect-client-id",
      value: clientId,
    }),
    createMockSettingDefinition({
      key: "slack-connect-client-secret",
      value: clientSecret,
    }),
    createMockSettingDefinition({
      key: "metabot-slack-signing-secret",
      value: signingSecret,
    }),
    createMockSettingDefinition({
      key: "slack-connect-enabled",
      value: isEnabled,
    }),
  ]);
  setupUpdateSettingEndpoint();
  setupMetabotSlackSettingsEndpoint();
  setupSlackManifestEndpoint();
  setupSlackAppInfoEndpoint(appInfo);

  renderWithProviders(<MetabotSlackSetup />, {
    storeInitialState: { settings: createMockSettingsState(settings) },
  });

  // Wait for component to fully render
  if (isSlackTokenValid) {
    await screen.findByText("Natural language questions in Slack");
  }
};

const clientIdInput = () => screen.findByLabelText("Client ID");
const clientSecretInput = () => screen.findByLabelText("Client Secret");
const signingSecretInput = () => screen.findByLabelText("Signing Secret");
const saveButton = () => screen.findByRole("button", { name: "Save changes" });

describe("MetabotSlackSetup", () => {
  it("renders nothing when slack-token-valid? is false", async () => {
    await setup({ isSlackTokenValid: false });
    expect(
      screen.queryByText("Natural language questions in Slack"),
    ).not.toBeInTheDocument();
  });

  it("shows unconfigured form with all fields when secrets are missing", async () => {
    await setup();
    await screen.findByText("Natural language questions in Slack");
    expect(await clientIdInput()).toBeInTheDocument();
    expect(await clientSecretInput()).toBeInTheDocument();
    expect(await signingSecretInput()).toBeInTheDocument();
  });

  it("shows configured state with toggle, accordion, and Remove button", async () => {
    await setup(CONFIGURED);
    expect(
      await screen.findByText("Let people chat with Metabot"),
    ).toBeInTheDocument();
    expect(screen.getByText("View connection details")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("displays error message when submission fails", async () => {
    await setup();
    setupMetabotSlackSettingsEndpointWithError(400, "Invalid credentials");

    await userEvent.type(await clientIdInput(), "123.456");
    await userEvent.type(await clientSecretInput(), "secret");
    await userEvent.type(await signingSecretInput(), "signing");

    await userEvent.click(await saveButton());

    expect(await screen.findByText(/Invalid credentials/)).toBeInTheDocument();
  });

  describe("encryption alert", () => {
    it("shows alert with docs link and hides form when encryption is disabled", async () => {
      await setup({ isEncryptionEnabled: false });

      expect(
        await screen.findByText(
          "You must enable encryption for your instance in order to use this feature",
        ),
      ).toBeInTheDocument();

      expect(
        screen.getByRole("link", { name: "Learn how to enable encryption" }),
      ).toHaveAttribute(
        "href",
        expect.stringContaining("encrypting-database-details-at-rest"),
      );

      expect(screen.queryByLabelText("Client ID")).not.toBeInTheDocument();
    });
  });

  describe("missing scopes alert", () => {
    it("shows alert with copy button, Slack link, and hides form", async () => {
      await setup({
        appInfo: createMockSlackAppInfo({
          app_id: "A123ABC",
          team_id: "T456DEF",
          scopes: MISSING_SCOPES.scopes,
        }),
      });

      expect(
        await screen.findByText("Metabot needs more Slack permissions"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Copy manifest/i }),
      ).toBeInTheDocument();

      expect(
        screen.getByRole("link", { name: /Open Slack settings/i }),
      ).toHaveAttribute(
        "href",
        "https://app.slack.com/app-settings/T456DEF/A123ABC/app-manifest",
      );

      expect(screen.queryByLabelText("Client ID")).not.toBeInTheDocument();
    });
  });

  describe("unconfigured form", () => {
    it("disables submit button when fields are empty", async () => {
      await setup();
      await screen.findByText("Natural language questions in Slack");
      expect(await saveButton()).toBeDisabled();
    });

    it("submits settings via PUT /api/ee/metabot-v3/slack/settings", async () => {
      await setup();

      await userEvent.type(await clientIdInput(), "123.456");
      await userEvent.type(await clientSecretInput(), "secret123");
      await userEvent.type(await signingSecretInput(), "signing123");

      await userEvent.click(await saveButton());

      await waitFor(async () => {
        const puts = await findRequests("PUT");
        const req = puts.find((r) =>
          r.url.includes("/api/ee/metabot-v3/slack/settings"),
        );
        expect(req?.body).toEqual({
          "slack-connect-client-id": "123.456",
          "slack-connect-client-secret": "secret123",
          "metabot-slack-signing-secret": "signing123",
        });
      });
    });
  });

  describe("configured state", () => {
    it("shows disabled inputs inside accordion", async () => {
      await setup(CONFIGURED);
      await userEvent.click(await screen.findByText("View connection details"));

      expect(await clientIdInput()).toBeDisabled();
      expect(await clientSecretInput()).toBeDisabled();
      expect(await signingSecretInput()).toBeDisabled();
    });

    it("shows Basic Information link with app_id", async () => {
      await setup({ ...CONFIGURED, appInfo: { app_id: "A123ABC" } });
      await userEvent.click(await screen.findByText("View connection details"));

      const link = await screen.findByRole("link", {
        name: "Basic Information",
      });
      expect(link).toHaveAttribute(
        "href",
        "https://api.slack.com/apps/A123ABC/general",
      );
    });

    it("updates slack-connect-enabled setting when toggle is clicked", async () => {
      await setup({ ...CONFIGURED, isEnabled: false });

      const toggle = await screen.findByRole("switch", {
        name: "Let people chat with Metabot",
      });
      expect(toggle).not.toBeChecked();
      await userEvent.click(toggle);

      await waitFor(async () => {
        const puts = await findRequests("PUT");
        const req = puts.find((r) =>
          r.url.includes("/api/setting/slack-connect-enabled"),
        );
        expect(req?.body).toEqual({ value: true });
      });
    });
  });

  describe("remove flow", () => {
    it("opens modal and clears settings on confirm", async () => {
      await setup(CONFIGURED);

      await userEvent.click(
        await screen.findByRole("button", { name: "Remove" }),
      );
      expect(
        await screen.findByText("Clear Metabot settings?"),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Clear settings" }),
      );

      await waitFor(async () => {
        const puts = await findRequests("PUT");
        const req = puts.find((r) =>
          r.url.includes("/api/ee/metabot-v3/slack/settings"),
        );
        expect(req?.body).toEqual({
          "slack-connect-client-id": null,
          "slack-connect-client-secret": null,
          "metabot-slack-signing-secret": null,
        });
      });
    });
  });

  describe("edge cases", () => {
    it("shows unconfigured form when only some secrets are set", async () => {
      await setup({ clientId: "123.456", signingSecret: "signing123" });
      await screen.findByText("Natural language questions in Slack");

      expect(await clientIdInput()).toBeInTheDocument();
      expect(
        screen.queryByText("Let people chat with Metabot"),
      ).not.toBeInTheDocument();
    });

    it("shows configured UI alongside missing scopes alert", async () => {
      await setup({ ...CONFIGURED, appInfo: MISSING_SCOPES });

      expect(
        await screen.findByText("Metabot needs more Slack permissions"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Let people chat with Metabot"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Remove" }),
      ).toBeInTheDocument();
    });

    it("shows fallback Slack apps URL when app_id is missing", async () => {
      await setup({ ...CONFIGURED, appInfo: { app_id: null } });
      await userEvent.click(await screen.findByText("View connection details"));

      const link = await screen.findByRole("link", {
        name: "Basic Information",
      });
      expect(link).toHaveAttribute("href", "https://api.slack.com/apps");
    });

    it("fetches slack manifest on mount", async () => {
      await setup();
      await waitFor(() => {
        const calls = fetchMock.callHistory.calls();
        expect(
          calls.find((c) => c.request?.url.includes("/api/slack/manifest")),
        ).toBeDefined();
      });
    });
  });
});
