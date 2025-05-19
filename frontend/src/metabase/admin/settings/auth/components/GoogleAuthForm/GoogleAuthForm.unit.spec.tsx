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
} from "metabase-types/api/mocks";

import { GoogleAuthForm } from "./GoogleAuthForm";

const setup = async (moreSettings = {}, envSettings = false) => {
  const settings = createMockSettings({
    "google-auth-enabled": false,
    "google-auth-client-id": null,
    "google-auth-auto-create-accounts-domain": null,
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
};

describe("GoogleAuthForm", () => {
  it("should submit the form", async () => {
    await setup();

    await userEvent.type(screen.getByLabelText("Client ID"), "id.test");
    await waitFor(() => expect(screen.getByText(/Save/)).toBeEnabled());
    await userEvent.click(screen.getByText("Save and enable"));

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
