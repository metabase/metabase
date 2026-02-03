import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateGoogleAuthEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { GoogleAuthForm } from "./GoogleAuthForm";

const setup = async (
  moreSettings = {},
  envSettings = false,
  tokenFeatures = {},
) => {
  const settings = createMockSettings({
    "google-auth-enabled": false,
    "google-auth-client-id": null,
    "google-auth-auto-create-accounts-domain": null,
    "token-features": createMockTokenFeatures(tokenFeatures),
    ...moreSettings,
  });
  setupPropertiesEndpoints(settings);
  setupUpdateGoogleAuthEndpoint();
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "google-auth-enabled",
      env_name: "MB_GOOGLE_AUTH_ENABLED",
      is_env_setting: envSettings,
    }),
    createMockSettingDefinition({
      key: "google-auth-client-id",
      env_name: "MB_GOOGLE_AUTH_CLIENT_ID",
      is_env_setting: envSettings,
    }),
    createMockSettingDefinition({
      key: "google-auth-auto-create-accounts-domain",
      env_name: "MB_GOOGLE_AUTH_AUTO_CREATE_ACCOUNTS_DOMAIN",
      is_env_setting: false,
    }),
  ]);

  renderWithProviders(<GoogleAuthForm />);

  // Wait for form to fully render before returning
  await screen.findByLabelText("Client ID");
};

describe("GoogleAuthForm", () => {
  it("should submit the form", async () => {
    await setup();

    await userEvent.type(screen.getByLabelText("Client ID"), "id.test");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Save/ })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: /Save/ }));

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toMatch(/api\/google\/settings/);
    expect(body).toEqual({
      "google-auth-enabled": true,
      "google-auth-client-id": "id.test",
      "google-auth-auto-create-accounts-domain": null,
    });
  });

  it("should not submit the form without required fields", async () => {
    await setup({ "google-auth-enabled": true });
    await userEvent.type(screen.getByLabelText("Domain"), "domain.test");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("should allow multi-domain auth with the token feature", async () => {
    await setup(
      {
        "google-auth-enabled": true,
        "google-auth-client-id": "id.test",
      },
      undefined,
      { sso_google: true },
    );
    expect(
      await screen.findByText(/email address is from one of the domains/),
    ).toBeInTheDocument();
  });

  it("should not allow multi-domain auth without the token feature", async () => {
    await setup(
      {
        "google-auth-enabled": true,
        "google-auth-client-id": "id.test",
      },
      undefined,
      { sso_google: false },
    );

    expect(
      await screen.findByText(/email address is from:/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/email address is from one of the domains/),
    ).not.toBeInTheDocument();
  });

  it("should submit the form when required fields set by env vars", async () => {
    await setup(
      {
        "google-auth-enabled": true,
        "google-auth-client-id": "abc-123.apps.googleusercontent.com",
      },
      true,
    );

    await screen.findByText("Using MB_GOOGLE_AUTH_CLIENT_ID");
    const textInput = screen.getByLabelText("Domain");
    await userEvent.type(textInput, "domain.limo");

    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
  });
});
