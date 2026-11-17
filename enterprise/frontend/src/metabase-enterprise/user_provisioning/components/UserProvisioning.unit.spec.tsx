import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  findRequests,
  setupApiKeyEndpoints,
  setupSettingsEndpoints,
  setupStatefulScimEndpoints,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockSettingsState } from "__support__/state";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { AuthenticationSettingsPage } from "metabase/admin/settings/components/SettingsPages/AuthenticationSettingsPage";
import { reinitialize } from "metabase/plugins";
import type { EnterpriseSettings, SettingDefinition } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { UserProvisioning } from "./UserProvisioning";

const SCIM_BASE_URL = "http://localhost:4000/api/ee/scim/v2";
const MASK = "*".repeat(40);
const SAML_WARNING =
  "When enabled, SAML user provisioning will be turned off in favor of SCIM.";

interface SetupOpts {
  settings?: Partial<EnterpriseSettings>;
  hasScimToken?: boolean;
  tokenGenerationFails?: boolean;
  settingDefinitions?: Parameters<typeof setupSettingsEndpoints>[0];
  scimDelay?: number;
  /** Render the settings route's page with the EE auth and SCIM plugins, as the app does. */
  throughSettingsPage?: boolean;
}

const setup = async ({
  settings: opts,
  hasScimToken = true,
  tokenGenerationFails = false,
  settingDefinitions = [],
  scimDelay,
  throughSettingsPage = false,
}: SetupOpts = {}) => {
  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({
      sso_jwt: true,
      scim: true,
    }),
    ...opts,
  });
  const settingsStore = setupStatefulSettingsEndpoints(settings);
  setupSettingsEndpoints(settingDefinitions);
  const scimStore = setupStatefulScimEndpoints({
    hasToken: hasScimToken,
    failGeneration: tokenGenerationFails,
    delay: scimDelay,
  });

  if (throughSettingsPage) {
    // the page shows the OSS cards, API key count included, until it knows about SSO
    setupApiKeyEndpoints([]);
    mockSettings(settings);
    setupEnterpriseOnlyPlugin("auth");
    setupEnterpriseOnlyPlugin("user_provisioning");
  }

  renderWithProviders(
    throughSettingsPage ? (
      <AuthenticationSettingsPage tab="user-provisioning" />
    ) : (
      <UserProvisioning />
    ),
    {
      storeInitialState: { settings: createMockSettingsState(settings) },
    },
  );
  await waitForLoaderToBeRemoved();

  return { settingsStore, scimStore };
};

const SCIM_SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    key: "scim-enabled",
    is_env_setting: false,
    env_name: "MB_SCIM_ENABLED",
    value: null,
  },
  {
    key: "scim-base-url",
    is_env_setting: false,
    env_name: "",
    value: SCIM_BASE_URL,
  },
];

const getScimSetting = () => screen.getByTestId("scim-enabled-setting");
const getScimToggle = () =>
  within(getScimSetting()).getByLabelText(/Enabled|Disabled/);
const getPosts = () => findRequests("POST");
const getScimSettingPuts = async () =>
  (await findRequests("PUT")).filter(({ url }) =>
    url.includes("/api/setting/scim-enabled"),
  );

describe("SCIM User Provisioning Settings", () => {
  afterEach(() => {
    // the settings page test registers EE plugins and sets global settings
    reinitialize();
    mockSettings();
  });

  it("should show a not found error when the scim feature is not enabled", async () => {
    await setup({
      settings: {
        "token-features": createMockTokenFeatures({
          scim: false,
        }),
      },
    });

    expect(
      await screen.findByText("The page you asked for couldn't be found."),
    ).toBeInTheDocument();
  });

  it("should render the component", async () => {
    await setup();
    expect(
      await screen.findByText("User provisioning via SCIM"),
    ).toBeInTheDocument();
  });

  it.each([
    {
      label: "toggle SCIM off",
      initialValue: true,
      expectedText: "Enabled",
      finalValue: false,
    },
    {
      label: "toggle SCIM on",
      initialValue: false,
      expectedText: "Disabled",
      finalValue: true,
    },
  ])("should $label", async ({ initialValue, expectedText, finalValue }) => {
    await setup({
      settings: {
        "scim-enabled": initialValue,
      },
    });

    const toggle = await screen.findByText(expectedText);
    await userEvent.click(toggle);

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toMatch(/\/api\/setting\/scim-enabled/);
    expect(body).toEqual({
      value: finalValue,
    });
  });

  it("should show admin notification toggle if SSO is enabled", async () => {
    await setup({
      settings: {
        "google-auth-enabled": true,
      },
    });

    expect(
      await screen.findByText(
        "Notify admins of new users provisioned from SSO",
      ),
    ).toBeInTheDocument();
  });

  it("should allow copying the scim URL", async () => {
    window.prompt = jest.fn(); // no idea what this does, but jsdom says it's not implemented
    Object.assign(window.navigator, {
      clipboard: {
        writeText: jest.fn().mockImplementation(() => Promise.resolve()),
      },
    });
    await setup({
      settings: {
        "scim-enabled": true,
      },
      settingDefinitions: [
        {
          key: "scim-base-url",
          is_env_setting: false,
          env_name: "",
          value: "https://example.com/api/ee/scim/v2",
        },
      ],
    });

    await userEvent.click(await screen.findByLabelText("copy icon"));

    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://example.com/api/ee/scim/v2",
    );
  });

  it("should call the regenerate token endpoint", async () => {
    await setup({
      settings: {
        "scim-enabled": true,
      },
    });

    const regenerateButton = await screen.findByText("Regenerate");
    await userEvent.click(regenerateButton);

    // confirm modal
    expect(await screen.findByText("Regenerate token?")).toBeInTheDocument();
    await userEvent.click(await screen.findByText("Regenerate now"));

    // token modal
    await screen.findByText("Copy and save the SCIM token");

    const posts = await findRequests("POST");
    expect(posts).toHaveLength(1);
    const [{ url }] = posts;
    expect(url).toMatch(/\/api\/ee\/scim\/api_key/);
  });

  it("should set up and manage SCIM from the user provisioning settings page", async () => {
    const { scimStore } = await setup({
      throughSettingsPage: true,
      settings: { "scim-enabled": false },
      hasScimToken: false,
      settingDefinitions: SCIM_SETTING_DEFINITIONS,
    });

    expect(
      await screen.findByText("User provisioning via SCIM"),
    ).toBeInTheDocument();
    // never enabled before: no endpoint or token yet
    expect(
      screen.queryByLabelText("SCIM endpoint URL"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("SCIM token")).not.toBeInTheDocument();

    // enabling generates a token and shows it unmasked once
    await userEvent.click(getScimToggle());
    const firstModal = await screen.findByRole("dialog", {
      name: "Here's what you'll need to set SCIM up",
    });
    expect(within(firstModal).getByLabelText("SCIM endpoint URL")).toHaveValue(
      SCIM_BASE_URL,
    );
    const firstToken = within(firstModal).getByLabelText("SCIM token");
    expect(firstToken).toHaveValue(`mb_1Tok${"s".repeat(36)}`);
    expect(firstToken).not.toHaveValue(expect.stringContaining(MASK));
    expect((await getScimSettingPuts()).map(({ body }) => body)).toEqual([
      { value: true },
    ]);
    expect(await getPosts()).toHaveLength(1);

    await userEvent.click(
      within(firstModal).getByRole("button", { name: "Done" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // the page shows the endpoint and the masked token
    expect(screen.getByLabelText("SCIM endpoint URL")).toHaveValue(
      SCIM_BASE_URL,
    );
    await waitFor(() => {
      expect(screen.getByLabelText("SCIM token")).toHaveValue(`mb_1Tok${MASK}`);
    });

    // regenerate
    await userEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    const confirm = await screen.findByRole("dialog", {
      name: "Regenerate token?",
    });
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Regenerate now" }),
    );
    const regenerateModal = await screen.findByRole("dialog", {
      name: "Copy and save the SCIM token",
    });
    const regeneratedToken =
      await within(regenerateModal).findByLabelText("SCIM token");
    expect(regeneratedToken).toHaveValue(`mb_2Tok${"s".repeat(36)}`);
    expect(await getPosts()).toHaveLength(2);
    await userEvent.click(
      within(regenerateModal).getByRole("button", { name: "Done" }),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("SCIM token")).toHaveValue(`mb_2Tok${MASK}`);
    });

    // cancelling the regeneration keeps the token
    await userEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    const cancelConfirm = await screen.findByRole("dialog", {
      name: "Regenerate token?",
    });
    await userEvent.click(
      within(cancelConfirm).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("SCIM token")).toHaveValue(`mb_2Tok${MASK}`);
    expect(await getPosts()).toHaveLength(2);
    expect(scimStore.issuedTokens).toBe(2);

    // disabling keeps the endpoint and token, but regeneration is off
    await userEvent.click(getScimToggle());
    expect(
      await within(getScimSetting()).findByLabelText("Disabled"),
    ).not.toBeChecked();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
    });
    expect(screen.getByLabelText("SCIM endpoint URL")).toHaveValue(
      SCIM_BASE_URL,
    );
    expect(screen.getByLabelText("SCIM token")).toHaveValue(`mb_2Tok${MASK}`);

    // re-enabling keeps the existing token
    await userEvent.click(getScimToggle());
    expect(
      await within(getScimSetting()).findByLabelText("Enabled"),
    ).toBeChecked();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
    });
    expect((await getScimSettingPuts()).map(({ body }) => body)).toEqual([
      { value: true },
      { value: false },
      { value: true },
    ]);
    expect(await getPosts()).toHaveLength(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("should warn that SAML user provisioning will be turned off only until SCIM has a token", async () => {
    await setup({
      settings: {
        "scim-enabled": false,
        "saml-enabled": true,
        "saml-user-provisioning-enabled?": true,
        "token-features": createMockTokenFeatures({
          sso_saml: true,
          scim: true,
        }),
      },
      hasScimToken: false,
      settingDefinitions: SCIM_SETTING_DEFINITIONS,
    });

    expect(await screen.findByText(SAML_WARNING)).toBeInTheDocument();
    expect(
      within(getScimSetting()).getByLabelText("Disabled"),
    ).not.toBeChecked();

    await userEvent.click(getScimToggle());
    expect(
      await within(getScimSetting()).findByLabelText("Enabled"),
    ).toBeChecked();
    const modal = await screen.findByRole("dialog", {
      name: "Here's what you'll need to set SCIM up",
    });
    await userEvent.click(within(modal).getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(screen.queryByText(SAML_WARNING)).not.toBeInTheDocument();
    });

    // still hidden after SCIM is turned off again, as the token stays
    await userEvent.click(getScimToggle());
    expect(
      await within(getScimSetting()).findByLabelText("Disabled"),
    ).not.toBeChecked();
    await waitFor(async () => {
      expect(await getScimSettingPuts()).toHaveLength(2);
    });
    expect(screen.getByLabelText("SCIM token")).toHaveValue(`mb_1Tok${MASK}`);
    expect(screen.queryByText(SAML_WARNING)).not.toBeInTheDocument();
  });

  it("should show the token error and a Retry button when enabling SCIM fails to generate a token", async () => {
    await setup({
      settings: { "scim-enabled": false },
      hasScimToken: false,
      tokenGenerationFails: true,
      settingDefinitions: SCIM_SETTING_DEFINITIONS,
    });

    await userEvent.click(getScimToggle());

    expect(
      await screen.findByText("Token failed to generate, Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect((await getScimSettingPuts()).map(({ body }) => body)).toEqual([
      { value: true },
    ]);
    expect(await getPosts()).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  describe("SCIM enabled without a token (e.g. via config file)", () => {
    it("should show the warning and Generate button (and no error) when no token exists yet", async () => {
      await setup({
        settings: { "scim-enabled": true },
        hasScimToken: false,
      });

      expect(
        await screen.findByText(
          "Generate a SCIM token below to complete the setup.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Generate")).toBeInTheDocument();
      expect(screen.queryByText("Regenerate")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Token failed to generate, Please try again."),
      ).not.toBeInTheDocument();
    });

    it("should generate a token when Generate is clicked", async () => {
      await setup({
        settings: { "scim-enabled": true },
        hasScimToken: false,
      });

      await userEvent.click(await screen.findByText("Generate"));

      // the first-enabled modal should appear with the new token
      await screen.findByText("Here's what you'll need to set SCIM up");

      const posts = await findRequests("POST");
      expect(posts).toHaveLength(1);
      const [{ url }] = posts;
      expect(url).toMatch(/\/api\/ee\/scim\/api_key/);

      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      // the warning goes once the refetched token is there
      expect(
        await screen.findByRole("button", { name: "Regenerate" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("SCIM token")).toHaveValue(`mb_1Tok${MASK}`);
      expect(
        screen.queryByText(
          "Generate a SCIM token below to complete the setup.",
        ),
      ).not.toBeInTheDocument();
    });
  });

  describe("SCIM enabled with failed token generation", () => {
    it("should show the token-failed error and a Retry button after a failed generation", async () => {
      await setup({
        settings: { "scim-enabled": true },
        hasScimToken: false,
        tokenGenerationFails: true,
      });

      // click Generate to trigger the failed attempt
      await userEvent.click(await screen.findByText("Generate"));

      // the modal is not opened on failure; the form surfaces the error directly
      expect(
        await screen.findByText("Token failed to generate, Please try again."),
      ).toBeInTheDocument();
      expect(screen.getByText("Retry")).toBeInTheDocument();
      // the generic "needs a token" warning is suppressed in favor of the specific error
      expect(
        screen.queryByText(
          "Generate a SCIM token below to complete the setup.",
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Here's what you'll need to set SCIM up"),
      ).not.toBeInTheDocument();
    });
  });

  describe("SCIM enabled with a token, regenerate fails", () => {
    it("should close the regenerate modal and surface the error on the SCIM token field", async () => {
      await setup({
        settings: { "scim-enabled": true },
        tokenGenerationFails: true,
      });

      await userEvent.click(await screen.findByText("Regenerate"));

      // confirm modal
      expect(await screen.findByText("Regenerate token?")).toBeInTheDocument();
      await userEvent.click(await screen.findByText("Regenerate now"));

      // the post-regenerate modal must NOT appear on failure
      expect(
        await screen.findByText(
          "Failed to regenerate token. Please try again.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("Regenerate token?")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Copy and save the SCIM token"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("An error occurred")).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Regenerate" }),
      ).toBeInTheDocument();
    });
  });

  describe("SCIM enabled via environment variable", () => {
    it("should show the env-var message instead of the toggle when scim-enabled is set by env", async () => {
      await setup({
        settings: { "scim-enabled": true },
        settingDefinitions: [
          {
            key: "scim-enabled",
            is_env_setting: true,
            env_name: "MB_SCIM_ENABLED",
            value: true,
          },
        ],
      });

      expect(screen.getByTestId("setting-env-var-message")).toBeInTheDocument();
      expect(screen.getByText(/MB_SCIM_ENABLED/)).toBeInTheDocument();
      expect(
        screen.queryByRole("switch", { name: /scim/i }),
      ).not.toBeInTheDocument();
    });
  });
});
