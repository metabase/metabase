import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupScimEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { EnterpriseSettings } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { UserProvisioning } from "./UserProvisioning";

const setup = async ({
  settings: opts,
}: { settings?: Partial<EnterpriseSettings> } = {}) => {
  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({
      sso_jwt: true,
      scim: true,
    }),
    ...opts,
  });
  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupScimEndpoints({
    key_prefix: "mb_/1qM",
    key: "$2a$10$Mu6b.47KRz46Ko2eTJ8Os.3S2uKRwsjNxLZf3V1yVqiDnI3Ruv5C2",
    masked_key: "mb_/1qM****************************************",
    unmasked_key: "mb_/1qMpikachuoEbRrFa9XdAvRQfzyXcoiu1I0MfiEsmw=",
    updated_by_id: 1,
    name: "Metabase SCIM API Key - fc6a551f-d9ad-4d1a-9add-da3bedd12c87",
    scope: "scim",
    creator_id: 1,
    updated_at: "2025-01-12T16:08:20.164094Z",
    created_at: "2025-01-12T16:08:20.164094Z",
    user_id: null,
    id: 626,
  });
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
    });

    await userEvent.click(screen.getByLabelText("copy icon"));

    expect(await screen.findByText("Copied!")).toBeInTheDocument();
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
});
