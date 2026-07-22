import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import type { EnterpriseSettings } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { UserProvisioning } from "./UserProvisioning";

const MOCK_SCIM_TOKEN = {
  key_prefix: "mb_/1qM",
  key: "$2a$10$Mu6b.47KRz46Ko2eTJ8Os.3S2uKRwsjNxLZf3V1yVqiDnI3Ruv5C2",
  masked_key: "mb_/1qM****************************************",
  unmasked_key: "mb_/1qMpikachuoEbRrFa9XdAvRQfzyXcoiu1I0MfiEsmw=",
  updated_by_id: 1,
  name: "Metabase SCIM API Key - fc6a551f-d9ad-4d1a-9add-da3bedd12c87",
  scope: "scim" as const,
  creator_id: 1,
  updated_at: "2025-01-12T16:08:20.164094Z",
  created_at: "2025-01-12T16:08:20.164094Z",
  user_id: null,
  id: 626,
};

const setup = async ({
  settings: opts,
  hasScimToken = true,
  tokenGenerationFails = false,
  settingDefinitions = [],
}: {
  settings?: Partial<EnterpriseSettings>;
  hasScimToken?: boolean;
  tokenGenerationFails?: boolean;
  settingDefinitions?: Parameters<typeof setupSettingsEndpoints>[0];
} = {}) => {
  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({
      sso_jwt: true,
      scim: true,
    }),
    ...opts,
  });
  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints(settingDefinitions);
  if (hasScimToken) {
    fetchMock.get("path:/api/ee/scim/api_key", MOCK_SCIM_TOKEN);
  } else {
    fetchMock.get("path:/api/ee/scim/api_key", 404);
  }
  fetchMock.post(
    "path:/api/ee/scim/api_key",
    tokenGenerationFails
      ? { status: 500, body: { message: "An error occurred" } }
      : MOCK_SCIM_TOKEN,
  );
  setupUpdateSettingEndpoint();

  renderWithProviders(<UserProvisioning />, {
    storeInitialState: { settings: createMockSettingsState(settings) },
  });
  await waitForLoaderToBeRemoved();
};

describe("SCIM User Provisioning Settings", () => {
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
