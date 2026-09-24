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
  createMockGroup({ id: 2, name: "Administrators", magic_group_type: "admin" }),
  createMockGroup({ id: 3, name: "foo", magic_group_type: null }),
  createMockGroup({ id: 4, name: "bar", magic_group_type: null }),
  createMockGroup({ id: 5, name: "flamingos", magic_group_type: null }),
];

const SAML_GROUP_PLACEHOLDER = "Enter SAML group...";
const ISSUER_EXAMPLE = "http://www.example.com/141xkex604w0Q5PN724v";

type SetupOptions = { updateDelay?: number; readDelay?: number };

const setup = async (
  settingValues?: Partial<EnterpriseSettings>,
  settingDefinitions: SettingDefinition[] = [],
  { updateDelay, readDelay }: SetupOptions = {},
) => {
  const settings = createMockSettings(settingValues ?? {});
  setupSettingsEndpoints(settingDefinitions);
  // the switches and the mappings read their values back after saving, so the properties mock has to remember writes
  setupStatefulSettingsEndpoints(settings, { updateDelay, readDelay });

  fetchMock.get("path:/api/permissions/group", GROUPS);
  fetchMock.put("path:/api/saml/settings", { status: 204 });

  renderWithProviders(<SettingsSAMLForm />, { withUndos: true });

  await screen.findByText("Identity provider (IdP) configuration");
};

const setupConfigured = (
  settingValues?: Partial<EnterpriseSettings>,
  settingDefinitions?: SettingDefinition[],
  options?: SetupOptions,
) =>
  setup(
    { "saml-configured": true, ...settingValues },
    settingDefinitions,
    options,
  );

// Unjustified type cast. FIXME
const fields = [
  { label: /SAML Identity Provider URL/i, value: "https://example.test" },
  { label: /SAML Identity Provider Certificate/i, value: "abc-123" },
  { label: /SAML Identity Provider Issuer/i, value: "example.test.sso" },
] as { label: RegExp; value: string }[];

const IDP_SETTINGS = {
  "saml-enabled": true,
  "saml-identity-provider-uri": "https://example.test",
  "saml-identity-provider-certificate": fields[1].value,
  "saml-identity-provider-issuer": fields[2].value,
};

const groupMappingSwitch = () =>
  screen.getByRole("switch", { name: "Group mapping" });

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
    expect(body).not.toHaveProperty("saml-group-sync");
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

  it("lays the cards out in the designed order", async () => {
    await setupConfigured();

    const cardTitles = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(cardTitles).toEqual([
      "Identity provider (IdP) configuration",
      "Identity provider info",
      "Sign SSO requests",
      "User provisioning",
      "Group mapping",
    ]);
  });

  describe("defaults", () => {
    it("shows the application name default as a placeholder and leaves the field empty", async () => {
      await setup({ "saml-application-name": "Metabase" }, [
        { key: "saml-application-name", default: "Metabase" },
      ]);

      const input = screen.getByLabelText(/SAML application name/);
      expect(input).toHaveValue("");
      expect(input).toHaveAttribute("placeholder", "Metabase");
    });

    it("shows the application name an env var sets, read-only", async () => {
      await setup({ "saml-application-name": "Acme BI" }, [
        {
          key: "saml-application-name",
          is_env_setting: true,
          env_name: "MB_SAML_APPLICATION_NAME",
        },
      ]);

      const input = screen.getByLabelText(/SAML application name/);
      expect(input).toHaveValue("Acme BI");
      expect(input).toHaveAttribute("readonly");
      expect(input).not.toHaveAttribute("placeholder");
      expect(
        screen.getByText("Using MB_SAML_APPLICATION_NAME"),
      ).toBeInTheDocument();
    });

    it("moves the issuer example into the placeholder", async () => {
      await setup({}, [
        {
          key: "saml-identity-provider-issuer",
          description: `This is a unique identifier for the IdP. Often referred to as Entity ID or simply 'Issuer'. Depending on your IdP, this usually looks something like \`${ISSUER_EXAMPLE}\``,
        },
      ]);

      expect(
        screen.getByLabelText(/SAML identity provider issuer/),
      ).toHaveAttribute("placeholder", ISSUER_EXAMPLE);
      expect(
        screen.getByText(
          "This is a unique identifier for the IdP. Often referred to as Entity ID or simply 'Issuer'.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/usually looks something like/),
      ).not.toBeInTheDocument();
    });

    it("shows only the env-var notice under the attribute fields", async () => {
      await setup({ "saml-attribute-firstname": "given_name" }, [
        {
          key: "saml-attribute-email",
          description: "SAML attribute for the user's email address",
        },
        {
          key: "saml-attribute-firstname",
          is_env_setting: true,
          env_name: "MB_SAML_ATTRIBUTE_FIRSTNAME",
        },
      ]);

      expect(
        screen.queryByText("SAML attribute for the user's email address"),
      ).not.toBeInTheDocument();
      const firstNameInput = screen.getByLabelText(
        /User's first name attribute/,
      );
      expect(firstNameInput).toHaveValue("given_name");
      expect(firstNameInput).toHaveAttribute("readonly");
      expect(
        screen.getByText("Using MB_SAML_ATTRIBUTE_FIRSTNAME"),
      ).toBeInTheDocument();
    });

    it("keeps the keystore card collapsed until a keystore is set", async () => {
      await setup();

      expect(
        screen.getByRole("button", { name: "Sign SSO requests" }),
      ).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.getByText(
          "Use a keystore to sign authentication requests sent to your identity provider",
        ),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/SAML keystore path/)).not.toBeVisible();
    });

    it("opens the keystore card when a keystore is set", async () => {
      await setup({ "saml-keystore-path": "/etc/metabase/keystore.jks" }, [
        {
          key: "saml-keystore-password",
          description: "Password for opening the keystore",
        },
      ]);

      expect(
        screen.getByRole("button", { name: "Sign SSO requests" }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByLabelText(/SAML keystore path/)).toHaveValue(
        "/etc/metabase/keystore.jks",
      );
      // the password needs no explanation, so the backend copy stays off the page
      expect(
        screen.queryByText("Password for opening the keystore"),
      ).not.toBeInTheDocument();
    });
  });

  describe("user provisioning", () => {
    it("saves right away without touching the page form", async () => {
      await setupConfigured({
        ...IDP_SETTINGS,
        "saml-user-provisioning-enabled?": true,
      });
      const toggle = screen.getByRole("switch", { name: "User provisioning" });

      await userEvent.click(toggle);

      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toMatch(
        /\/api\/setting\/saml-user-provisioning-enabled%3F$/,
      );
    });

    it("locks the switch while SCIM manages provisioning", async () => {
      await setupConfigured({
        "scim-enabled": true,
        "saml-user-provisioning-enabled?": false,
      });

      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      expect(toggle).toHaveAttribute("aria-disabled", "true");
      expect(toggle).not.toBeChecked();
      expect(
        screen.getByRole("link", { name: "managed by SCIM" }),
      ).toHaveAttribute(
        "href",
        "/admin/settings/authentication/user-provisioning",
      );
    });

    it("shows the SCIM note instead of the env line when both apply", async () => {
      await setupConfigured(
        {
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
      expect(toggle).toHaveAttribute("aria-disabled", "true");
      expect(toggle).toHaveAccessibleDescription(/managed by SCIM/);
      expect(
        screen.queryByText("Using MB_SAML_USER_PROVISIONING_ENABLED"),
      ).not.toBeInTheDocument();
    });
  });

  describe("group mapping", () => {
    it("keeps the provisioning and group mapping cards disabled until the identity provider is set up", async () => {
      await setup({ "saml-group-sync": true });

      expect(
        screen.getByRole("switch", { name: "User provisioning" }),
      ).toBeDisabled();
      expect(groupMappingSwitch()).toBeDisabled();
      expect(groupMappingSwitch()).toBeChecked();
      expect(
        screen.queryByText("Manual group mappings"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("textbox", { name: /Group attribute name/ }),
      ).not.toBeInTheDocument();
    });

    it("turns group mapping on right away and reveals the mappings and the group attribute", async () => {
      await setupConfigured();

      await userEvent.click(groupMappingSwitch());

      expect(groupMappingSwitch()).toBeChecked();
      expect(screen.getByText("Manual group mappings")).toBeInTheDocument();
      expect(screen.getByText("No mappings yet")).toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: /Group attribute name/ }),
      ).toBeInTheDocument();
      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toMatch(/\/api\/setting\/saml-group-sync$/);
      expect(puts[0].body).toEqual({ value: true });
      expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
    });

    it("adds a mapping and writes it without touching the page form", async () => {
      await setupConfigured({ "saml-group-sync": true });

      await userEvent.click(screen.getByRole("button", { name: "New" }));
      await userEvent.type(
        screen.getByPlaceholderText(SAML_GROUP_PLACEHOLDER),
        "engineering",
      );
      await userEvent.click(
        screen.getByPlaceholderText("Pick Metabase group..."),
      );
      await userEvent.click(await screen.findByRole("option", { name: "bar" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Add mapping" }),
      );

      expect(await screen.findByText("Mapping added")).toBeInTheDocument();
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toMatch(/\/api\/setting$/);
      expect(puts[0].body).toEqual({
        "saml-group-mappings": { engineering: [4] },
      });
    });

    it("saves the group attribute with the page form", async () => {
      await setupConfigured({ ...IDP_SETTINGS, "saml-group-sync": true });

      await userEvent.type(
        screen.getByRole("textbox", { name: /Group attribute name/ }),
        "memberOf",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Save changes" }),
      );

      await screen.findByText("Success");
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toMatch(/api\/saml\/settings/);
      expect(puts[0].body["saml-attribute-group"]).toBe("memberOf");
      expect(puts[0].body).not.toHaveProperty("saml-group-sync");
    });

    it("drops an unsaved group attribute edit when group mapping is turned off", async () => {
      await setupConfigured({
        ...IDP_SETTINGS,
        "saml-group-sync": true,
        "saml-attribute-group": "groups",
      });
      const saveButton = () =>
        screen.getByRole("button", { name: "Save changes" });

      await userEvent.type(
        screen.getByRole("textbox", { name: /Group attribute name/ }),
        "X",
      );
      expect(saveButton()).toBeEnabled();

      await userEvent.click(groupMappingSwitch());
      await waitFor(() =>
        expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled"),
      );

      expect(saveButton()).toBeDisabled();
      await userEvent.click(groupMappingSwitch());
      expect(
        await screen.findByRole("textbox", { name: /Group attribute name/ }),
      ).toHaveValue("groups");
    });
  });
});
