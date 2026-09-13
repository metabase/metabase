import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupSettingsEndpoints,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { EnterpriseSettings, SettingDefinition } from "metabase-types/api";
import { createMockGroup, createMockSettings } from "metabase-types/api/mocks";

import { SettingsSAMLForm } from "./SettingsSAMLForm";

const GROUPS = [
  createMockGroup(),
  createMockGroup({ id: 2, name: "Administrators" }),
  createMockGroup({ id: 3, name: "foo" }),
  createMockGroup({ id: 4, name: "bar" }),
  createMockGroup({ id: 5, name: "flamingos" }),
];

const setup = async (
  settingValues?: Partial<EnterpriseSettings>,
  settingDefinitions: SettingDefinition[] = [],
) => {
  const settings = createMockSettings(settingValues ?? {});
  setupSettingsEndpoints(settingDefinitions);
  // the provisioning switch reads its value back after saving, so the properties mock has to remember writes
  setupStatefulSettingsEndpoints(settings);

  fetchMock.get("path:/api/permissions/group", GROUPS);
  fetchMock.put("path:/api/saml/settings", { status: 204 });

  renderWithProviders(<SettingsSAMLForm />, { withUndos: true });

  await screen.findByText("Configure your identity provider (IdP)");
  await waitFor(async () => {
    const gets = await findRequests("GET");
    expect(gets).toHaveLength(3);
  });
};

// Unjustified type cast. FIXME
const fields = [
  { label: /SAML Identity Provider URL/i, value: "https://example.test" },
  { label: /SAML Identity Provider Certificate/i, value: "abc-123" },
  { label: /SAML Identity Provider Issuer/i, value: "example.test.sso" },
] as { label: RegExp; value: string }[];

describe("SettingsSAMLForm", () => {
  it("Can enable SAML via form input", async () => {
    await setup();

    for (const { label, value } of fields) {
      // can't use forEach 🫠
      const input = await screen.findByLabelText(label);
      await userEvent.type(input, value);
    }

    const submitButton = await screen.findByRole("button", {
      name: "Save and enable",
    });
    expect(submitButton).toBeEnabled();
    await userEvent.click(submitButton);

    await screen.findByText("Success");

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toMatch(/api\/saml\/settings/);
    expect(body["saml-identity-provider-uri"]).toBe(fields[0].value);
    expect(body["saml-identity-provider-certificate"]).toBe(fields[1].value);
    expect(body["saml-identity-provider-issuer"]).toBe(fields[2].value);
  });

  it("Can update existing SAML settings", async () => {
    await setup({
      "saml-enabled": true,
      "saml-identity-provider-uri": "www.happy.toast",
      "saml-identity-provider-certificate": fields[1].value,
      "saml-identity-provider-issuer": fields[2].value,
    });

    const input = await screen.findByLabelText(fields[0].label);
    await userEvent.clear(input);
    await userEvent.type(input, "www.sad.sandwich");

    const submitButton = await screen.findByRole("button", {
      name: "Save changes",
    });
    expect(submitButton).toBeEnabled();
    await userEvent.click(submitButton);
    await screen.findByText("Success");

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toMatch(/api\/saml\/settings/);
    expect(body["saml-identity-provider-uri"]).toBe("www.sad.sandwich");
    expect(body["saml-identity-provider-certificate"]).toBe(fields[1].value);
    expect(body["saml-identity-provider-issuer"]).toBe(fields[2].value);
  });

  describe("user provisioning", () => {
    const CONFIGURED = {
      "saml-enabled": true,
      "saml-identity-provider-uri": "https://example.test",
      "saml-identity-provider-certificate": fields[1].value,
      "saml-identity-provider-issuer": fields[2].value,
    };

    it("sits right below the identity provider settings", async () => {
      await setup(CONFIGURED);

      const cardTitles = screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent);
      expect(cardTitles).toEqual([
        "Configure your identity provider (IdP)",
        "Tell Metabase about your identity provider",
        "User provisioning",
        "Sign SSO requests (optional)",
        "Group mapping",
      ]);
    });

    it("stays editable before the identity provider is set up", async () => {
      await setup();

      expect(
        screen.getByRole("switch", { name: "User provisioning" }),
      ).toBeEnabled();
    });

    it("saves right away without touching the page form", async () => {
      await setup({ ...CONFIGURED, "saml-user-provisioning-enabled?": true });
      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      expect(toggle).toBeEnabled();
      expect(toggle).toBeChecked();

      await userEvent.click(toggle);

      await waitFor(() => expect(toggle).not.toBeChecked());
      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toMatch(
        /\/api\/setting\/saml-user-provisioning-enabled%3F$/,
      );
      expect(puts[0].body).toEqual({ value: false });
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();
    });

    it("locks the switch while SCIM manages provisioning", async () => {
      await setup({
        ...CONFIGURED,
        "scim-enabled": true,
        "saml-user-provisioning-enabled?": false,
      });

      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      expect(toggle).toBeDisabled();
      expect(toggle).not.toBeChecked();
      expect(
        screen.getByRole("link", { name: "managed by SCIM" }),
      ).toHaveAttribute(
        "href",
        "/admin/settings/authentication/user-provisioning",
      );
    });

    it("shows the SCIM note instead of the env line when both apply", async () => {
      await setup(
        {
          ...CONFIGURED,
          "scim-enabled": true,
          "saml-user-provisioning-enabled?": false,
        },
        [
          {
            key: "saml-user-provisioning-enabled?",
            is_env_setting: true,
            env_name: "MB_SAML_USER_PROVISIONING_ENABLED",
          },
        ],
      );

      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      expect(toggle).toBeDisabled();
      expect(toggle).toHaveAccessibleDescription(/managed by SCIM/);
      expect(
        screen.queryByText("Using MB_SAML_USER_PROVISIONING_ENABLED"),
      ).not.toBeInTheDocument();
    });
  });
});
