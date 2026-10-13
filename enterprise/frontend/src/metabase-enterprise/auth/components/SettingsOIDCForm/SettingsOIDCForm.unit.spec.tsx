import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupSettingsEndpoints,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { defer, delay } from "metabase/utils/promise";
import { checkNotNull } from "metabase/utils/types";
import type { CustomOidcConfig } from "metabase-enterprise/api";
import {
  createMockGroup,
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { SettingsOIDCForm } from "./SettingsOIDCForm";

const GROUPS = [
  createMockGroup({
    id: 1,
    name: "All Users",
    magic_group_type: "all-internal-users",
  }),
  createMockGroup({ id: 2, name: "Administrators", magic_group_type: "admin" }),
  createMockGroup({ id: 3, name: "Engineering", magic_group_type: null }),
  createMockGroup({ id: 4, name: "Marketing", magic_group_type: null }),
];

const EXISTING_PROVIDER: CustomOidcConfig = {
  key: "okta",
  "login-prompt": "Sign in with Okta",
  "issuer-uri": "https://okta.example.com",
  "client-id": "client-123",
  scopes: ["openid", "email", "profile"],
  enabled: true,
  "attribute-map": {
    email: "email",
    first_name: "given_name",
    last_name: "family_name",
  },
};

const MAPPED_PROVIDER: CustomOidcConfig = {
  ...EXISTING_PROVIDER,
  "group-sync": {
    enabled: true,
    "group-attribute": "groups",
    "group-mappings": { admins: [2] },
  },
};

const OIDC_GROUP_PLACEHOLDER = "Enter OIDC group...";

const setup = async ({
  providers = [],
  configured = providers.length > 0,
  providersEnvName,
  groupDeleteGate,
  writeDelay,
  readDelay,
  readStatus,
  writeStatus,
  writeMessage,
  writeGate,
}: {
  providers?: CustomOidcConfig[];
  configured?: boolean;
  providersEnvName?: string;
  groupDeleteGate?: Promise<void>;
  writeDelay?: number;
  readDelay?: number;
  readStatus?: number;
  writeStatus?: number;
  writeMessage?: string;
  writeGate?: Promise<void>;
} = {}) => {
  setupSettingsEndpoints(
    providersEnvName == null
      ? []
      : [
          createMockSettingDefinition({
            key: "oidc-providers",
            is_env_setting: true,
            env_name: providersEnvName,
          }),
        ],
  );
  setupStatefulSettingsEndpoints(
    createMockSettings({ "oidc-configured": configured }),
  );
  fetchMock.get("path:/api/permissions/group", GROUPS);
  fetchMock.delete("express:/api/permissions/group/:id", async () => {
    await groupDeleteGate;
    return 204;
  });
  const stored = providers.map((provider) => ({ ...provider }));
  fetchMock.get(
    "path:/api/ee/sso/oidc",
    () =>
      readStatus != null
        ? { status: readStatus }
        : stored.map((provider) => ({ ...provider })),
    { delay: readDelay },
  );
  fetchMock.post("path:/api/ee/sso/oidc", ({ options }) => {
    const provider = JSON.parse(String(options.body));
    stored.push(provider);
    return provider;
  });
  fetchMock.put(
    "express:/api/ee/sso/oidc/:key",
    async ({ url, options }) => {
      await writeGate;
      if (writeStatus != null) {
        return { status: writeStatus, body: writeMessage };
      }
      const key = url.split("/api/ee/sso/oidc/")[1];
      const index = stored.findIndex((provider) => provider.key === key);
      stored[index] = {
        ...stored[index],
        ...JSON.parse(String(options.body)),
      };
      return stored[index];
    },
    { delay: writeDelay },
  );
  fetchMock.post("path:/api/ee/sso/oidc/check", {
    ok: true,
    discovery: { step: "discovery", success: true },
    credentials: { step: "credentials", success: true, verified: true },
  });

  renderWithProviders(<SettingsOIDCForm />, { withUndos: true });

  if (readStatus == null) {
    await screen.findByText("OpenID Connect");
  }
};

async function getOidcPutCalls() {
  const puts = await findRequests("PUT");
  return puts.filter(({ url }) => url.includes("/api/ee/sso/oidc/okta"));
}

const groupMappingSwitch = () =>
  screen.getByRole("switch", { name: "Group mapping" });

const queryMappingRow = (name: string) =>
  screen
    .queryAllByTestId("group-mapping-row")
    .find((row) => within(row).queryByText(name) != null);

const getMappingRow = (name: string) => checkNotNull(queryMappingRow(name));

const expandAttributes = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Attributes" }));
};

const fillRequiredFields = async () => {
  await userEvent.type(screen.getByLabelText(/^Key/), "okta");
  await userEvent.type(screen.getByLabelText(/^Login prompt/), "Sign in");
  await userEvent.type(
    screen.getByLabelText(/^Issuer URI/),
    "https://idp.example.test",
  );
  await userEvent.type(screen.getByLabelText(/^Client ID/), "client-123");
  await userEvent.type(
    screen.getByLabelText(/^Client secret/),
    "client-secret-123",
  );
};

const clickWhenEnabled = async (element: HTMLElement) => {
  await waitFor(() => expect(element).toBeEnabled());
  await userEvent.click(element);
};

const addMapping = async (name: string, groupName: string) => {
  await clickWhenEnabled(screen.getByRole("button", { name: "New" }));
  await userEvent.type(
    screen.getByPlaceholderText(OIDC_GROUP_PLACEHOLDER),
    name,
  );
  await userEvent.click(screen.getByPlaceholderText("Pick Metabase group..."));
  await userEvent.click(await screen.findByRole("option", { name: groupName }));
  await userEvent.click(screen.getByRole("button", { name: "Add mapping" }));
};

describe("SettingsOIDCForm", () => {
  describe("loading", () => {
    it("shows an error instead of an empty form when the providers fail to load", async () => {
      await setup({ readStatus: 500 });

      expect(
        await screen.findByText("Error loading OIDC configuration"),
      ).toBeInTheDocument();
      expect(screen.queryByText("OpenID Connect")).not.toBeInTheDocument();
    });
  });

  describe("environment variable", () => {
    it("locks the whole page when the providers come from an environment variable", async () => {
      await setup({
        providers: [MAPPED_PROVIDER],
        providersEnvName: "MB_OIDC_PROVIDERS",
      });

      expect(screen.getByTestId("setting-env-var-message")).toHaveTextContent(
        "This has been set by the MB_OIDC_PROVIDERS environment variable.",
      );
      expect(screen.getByLabelText(/^Issuer URI/)).toHaveAttribute("readonly");
      expect(screen.getByLabelText("Group attribute name")).toHaveAttribute(
        "readonly",
      );
      expect(
        screen.queryByRole("button", { name: "Save changes" }),
      ).not.toBeInTheDocument();
      expect(groupMappingSwitch()).toHaveAttribute("aria-disabled", "true");
      expect(groupMappingSwitch()).toHaveAccessibleDescription(
        /Using MB_OIDC_PROVIDERS/,
      );
      const banner = screen.getByTestId("setting-env-var-message");
      const serverSettingsAfterBanner = banner.compareDocumentPosition(
        screen.getByRole("heading", { name: "Server settings" }),
      );
      const provisioningAfterBanner = banner.compareDocumentPosition(
        screen.getByRole("switch", { name: "User provisioning" }),
      );
      expect(serverSettingsAfterBanner & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(provisioningAfterBanner & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(queryMappingRow("admins")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "New" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Delete mapping")).not.toBeInTheDocument();
      expect(
        screen.getByRole("switch", { name: "User provisioning" }),
      ).not.toHaveAttribute("aria-disabled");
    });

    it("locks an empty page too, since a new provider would be ignored as well", async () => {
      await setup({ providersEnvName: "MB_OIDC_PROVIDERS" });

      expect(screen.getByTestId("setting-env-var-message")).toBeInTheDocument();
      expect(screen.getByLabelText(/^Key/)).toHaveAttribute("readonly");
      expect(
        screen.queryByRole("button", { name: "Save and enable" }),
      ).not.toBeInTheDocument();
      expect(groupMappingSwitch()).not.toHaveAccessibleDescription(
        /Save the settings above to set up group mapping/,
      );
    });
  });

  describe("client secret", () => {
    it("is required for a new provider", async () => {
      await setup();
      await fillRequiredFields();
      const saveButton = screen.getByRole("button", {
        name: "Save and enable",
      });
      await waitFor(() => expect(saveButton).toBeEnabled());

      await userEvent.clear(screen.getByLabelText(/^Client secret/));

      expect(screen.getByLabelText(/^Client secret/)).toBeRequired();
      await waitFor(() => expect(saveButton).toBeDisabled());
    });

    it("stays optional for an existing provider", async () => {
      await setup({ providers: [EXISTING_PROVIDER] });

      expect(screen.getByLabelText(/^Client secret/)).not.toBeRequired();
    });
  });

  describe("layout", () => {
    it("lays the cards out in the designed order", async () => {
      await setup({ providers: [EXISTING_PROVIDER] });

      const cardTitles = screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent);
      expect(cardTitles).toEqual([
        "Server settings",
        "User provisioning",
        "Attributes",
        "Group mapping",
      ]);
    });

    it("keeps the group mapping card disabled until the provider is saved", async () => {
      await setup();

      const provisioningSwitch = screen.getByRole("switch", {
        name: "User provisioning",
      });
      expect(provisioningSwitch).toBeEnabled();
      expect(provisioningSwitch).not.toHaveAttribute("aria-disabled");
      expect(screen.getByRole("button", { name: "Attributes" })).toBeEnabled();
      expect(groupMappingSwitch()).toBeDisabled();
      expect(groupMappingSwitch()).not.toBeChecked();
      expect(groupMappingSwitch()).toHaveAccessibleDescription(
        /Save the settings above to set up group mapping/,
      );
      expect(
        screen.queryByRole("textbox", { name: /Group attribute name/ }),
      ).not.toBeInTheDocument();
    });

    it("locks the group mapping card on the backend's configured flag rather than the provider list", async () => {
      await setup({ providers: [EXISTING_PROVIDER], configured: false });

      expect(groupMappingSwitch()).toBeDisabled();
    });
  });

  describe("defaults", () => {
    it("shows the defaults as placeholders and leaves the fields empty for a new provider", async () => {
      await setup();

      const key = screen.getByLabelText(/^Key/);
      expect(key).toHaveValue("");
      expect(key).toHaveAttribute("placeholder", "okta");
      const loginPrompt = screen.getByLabelText(/^Login prompt/);
      expect(loginPrompt).toHaveValue("");
      expect(loginPrompt).toHaveAttribute("placeholder", "Sign in with Okta");
      const clientId = screen.getByLabelText(/^Client ID/);
      expect(clientId).toHaveValue("");
      expect(clientId).toHaveAttribute("placeholder", "metabase-client-id");
      const clientSecret = screen.getByLabelText(/^Client secret/);
      expect(clientSecret).toHaveValue("");
      expect(clientSecret).toHaveAttribute("placeholder", "your-client-secret");
      const scopes = screen.getByLabelText(/^Scopes/);
      expect(scopes).toBeVisible();
      expect(scopes).toHaveValue("");
      expect(scopes).toHaveAttribute("placeholder", "openid, email, profile");
    });

    it("keeps the attributes card collapsed and shows the stored defaults as placeholders", async () => {
      await setup({ providers: [MAPPED_PROVIDER] });

      expect(
        screen.getByRole("button", { name: "Attributes" }),
      ).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByLabelText(/^Scopes/)).toHaveValue("");
      expect(screen.getByLabelText(/^Client secret/)).toHaveAttribute(
        "placeholder",
        "Leave blank to keep current value",
      );
      const attributeInput = screen.getByRole("textbox", {
        name: /Group attribute name/,
      });
      expect(attributeInput).toHaveValue("");
      expect(attributeInput).toHaveAttribute("placeholder", "groups");

      await expandAttributes();

      const firstName = screen.getByLabelText("First name attribute key");
      expect(firstName).toHaveValue("");
      expect(firstName).toHaveAttribute("placeholder", "given_name");
      const lastName = screen.getByLabelText("Last name attribute key");
      expect(lastName).toHaveValue("");
      expect(lastName).toHaveAttribute("placeholder", "family_name");
      expect(
        screen.queryByLabelText("Email attribute key"),
      ).not.toBeInTheDocument();
    });

    it("opens the attributes card and shows the claim a provider customized", async () => {
      await setup({
        providers: [
          {
            ...EXISTING_PROVIDER,
            scopes: ["openid", "email"],
            "attribute-map": {
              ...EXISTING_PROVIDER["attribute-map"],
              first_name: "givenName",
            },
          },
        ],
      });

      expect(
        screen.getByRole("button", { name: "Attributes" }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByLabelText(/^Scopes/)).toHaveValue("openid, email");
      expect(screen.getByLabelText("First name attribute key")).toHaveValue(
        "givenName",
      );
      expect(screen.getByLabelText("Last name attribute key")).toHaveValue("");
    });

    it("drops an email claim mapping saved earlier on the next save", async () => {
      await setup({
        providers: [
          {
            ...EXISTING_PROVIDER,
            "attribute-map": { email: "mail", first_name: "givenName" },
          },
        ],
      });

      await userEvent.type(
        screen.getByLabelText("Last name attribute key"),
        "surname",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Save changes" }),
      );

      await waitFor(async () =>
        expect(await getOidcPutCalls()).toHaveLength(1),
      );
      const [{ body }] = await getOidcPutCalls();
      expect(body["attribute-map"]).toEqual({
        first_name: "givenName",
        last_name: "surname",
      });
    });

    it("falls back to the default scopes and claims when the fields stay empty", async () => {
      await setup();
      await fillRequiredFields();

      await userEvent.click(
        screen.getByRole("button", { name: "Save and enable" }),
      );

      await waitFor(async () => {
        expect(await findRequests("POST")).toHaveLength(1);
      });
      const [{ body }] = (await findRequests("POST")).filter(({ url }) =>
        url.endsWith("/api/ee/sso/oidc"),
      );
      expect(body.scopes).toEqual(["openid", "email", "profile"]);
      expect(body["attribute-map"]).toEqual({});
      expect(body.enabled).toBe(true);
      expect(body["group-sync"]).toEqual({
        enabled: false,
        "group-attribute": "groups",
        "group-mappings": {},
      });
    });

    it("sends claims set before the first save with the new provider", async () => {
      await setup();
      await fillRequiredFields();
      await expandAttributes();
      const firstNameAttribute = screen.getByLabelText(
        "First name attribute key",
      );
      await waitFor(() => expect(firstNameAttribute).toBeVisible());
      await userEvent.type(firstNameAttribute, "givenName");

      await userEvent.click(
        screen.getByRole("button", { name: "Save and enable" }),
      );

      await waitFor(async () => {
        expect(await findRequests("POST")).toHaveLength(1);
      });
      const [{ body }] = (await findRequests("POST")).filter(({ url }) =>
        url.endsWith("/api/ee/sso/oidc"),
      );
      expect(body["attribute-map"]).toEqual({ first_name: "givenName" });
    });
  });

  describe("saving", () => {
    it("does not run a separate connection check when saving a new provider", async () => {
      await setup();
      await fillRequiredFields();

      await userEvent.click(
        screen.getByRole("button", { name: "Save and enable" }),
      );

      await waitFor(async () => {
        expect(await findRequests("POST")).toHaveLength(1);
      });
      const [{ url }] = await findRequests("POST");
      expect(url).toMatch(/\/api\/ee\/sso\/oidc$/);
    });

    it("does not run a separate connection check when saving an existing provider", async () => {
      await setup({ providers: [EXISTING_PROVIDER] });

      await expandAttributes();
      await userEvent.type(
        screen.getByLabelText("Last name attribute key"),
        "surname",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Save changes" }),
      );

      await waitFor(async () =>
        expect(await getOidcPutCalls()).toHaveLength(1),
      );
      expect(await findRequests("POST")).toHaveLength(0);
    });
  });

  describe("connection check", () => {
    it("sends the scopes from the form to the connection check", async () => {
      await setup({ providers: [EXISTING_PROVIDER] });

      await expandAttributes();
      const scopesInput = screen.getByLabelText(/^Scopes/);
      await waitFor(() => expect(scopesInput).toBeVisible());
      await userEvent.clear(scopesInput);
      await userEvent.type(
        scopesInput,
        "openid, https://graph.microsoft.com/.default",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Check connection" }),
      );

      await waitFor(async () => {
        const checks = (await findRequests("POST")).filter(({ url }) =>
          url.includes("/api/ee/sso/oidc/check"),
        );
        expect(checks).toHaveLength(1);
        expect(checks[0].body.scopes).toEqual([
          "openid",
          "https://graph.microsoft.com/.default",
        ]);
      });
    });
  });

  describe("user provisioning", () => {
    it("saves right away without touching the page form", async () => {
      await setup({ providers: [EXISTING_PROVIDER] });
      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      await waitFor(() => {
        expect(toggle).toBeEnabled();
        expect(toggle).not.toHaveAttribute("aria-disabled");
      });

      await userEvent.click(toggle);

      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toMatch(
        /\/api\/setting\/oidc-user-provisioning-enabled%3F$/,
      );
    });

    it("does not promise to reactivate accounts, which OIDC sign-in never does", async () => {
      await setup({ providers: [EXISTING_PROVIDER] });

      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      expect(toggle).toHaveAccessibleDescription(
        /create accounts for new users/,
      );
      expect(toggle).not.toHaveAccessibleDescription(/reactivate/);
    });

    it("stays editable while the provider is paused", async () => {
      await setup({ providers: [{ ...EXISTING_PROVIDER, enabled: false }] });

      const provisioningSwitch = screen.getByRole("switch", {
        name: "User provisioning",
      });
      expect(provisioningSwitch).toBeEnabled();
      expect(provisioningSwitch).not.toHaveAttribute("aria-disabled");
      expect(groupMappingSwitch()).toBeEnabled();
      expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled");
    });
  });

  describe("group mapping", () => {
    it("turns group mapping on right away and keeps the provider's other group settings", async () => {
      await setup({
        providers: [
          {
            ...EXISTING_PROVIDER,
            "group-sync": {
              enabled: false,
              "group-attribute": "roles",
              "group-mappings": { admins: [2] },
            },
          },
        ],
      });

      await userEvent.click(groupMappingSwitch());

      expect(groupMappingSwitch()).toBeChecked();
      expect(screen.getByText("Manual group mappings")).toBeInTheDocument();
      expect(queryMappingRow("admins")).toBeDefined();
      expect(
        screen.getByRole("textbox", { name: /Group attribute name/ }),
      ).toHaveValue("roles");
      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
      const puts = await getOidcPutCalls();
      expect(puts).toHaveLength(1);
      expect(puts[0].body).toEqual({
        "group-sync": {
          enabled: true,
          "group-attribute": "roles",
          "group-mappings": { admins: [2] },
        },
      });
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();
    });

    it("writes the default attribute for a provider that has no group sync yet", async () => {
      await setup({ providers: [EXISTING_PROVIDER] });

      await userEvent.click(groupMappingSwitch());

      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
      const puts = await getOidcPutCalls();
      expect(puts).toHaveLength(1);
      expect(puts[0].body).toEqual({
        "group-sync": {
          enabled: true,
          "group-attribute": "groups",
          "group-mappings": {},
        },
      });
    });

    it("keeps the switch off after a failed write", async () => {
      await setup({ providers: [EXISTING_PROVIDER], writeStatus: 500 });

      await userEvent.click(groupMappingSwitch());
      expect(
        await screen.findByText(/Error saving group mapping/),
      ).toBeInTheDocument();
      expect(groupMappingSwitch()).not.toBeChecked();
    });

    it("holds the card while the page form saves the provider", async () => {
      await setup({ providers: [MAPPED_PROVIDER], writeDelay: 200 });
      await userEvent.type(screen.getByLabelText(/^Login prompt/), "!");

      await userEvent.click(
        screen.getByRole("button", { name: "Save changes" }),
      );

      await waitFor(() =>
        expect(groupMappingSwitch()).toHaveAttribute("aria-disabled", "true"),
      );
      expect(screen.getByRole("button", { name: "New" })).toBeDisabled();
      await waitFor(() =>
        expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled"),
      );
      expect(screen.getByRole("button", { name: "New" })).toBeEnabled();
    });

    it("shows the new value and holds the card and the page save while the write is in flight", async () => {
      await setup({ providers: [EXISTING_PROVIDER], writeDelay: 200 });
      await userEvent.type(screen.getByLabelText(/^Login prompt/), "!");
      const saveButton = screen.getByRole("button", { name: "Save changes" });
      expect(saveButton).toBeEnabled();

      await userEvent.click(groupMappingSwitch());

      expect(groupMappingSwitch()).toBeChecked();
      expect(groupMappingSwitch()).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText("Manual group mappings")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "New" })).toBeDisabled();
      expect(saveButton).toBeDisabled();
      await waitFor(() =>
        expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled"),
      );
      expect(groupMappingSwitch()).toBeChecked();
      expect(screen.getByRole("button", { name: "New" })).toBeEnabled();
      await waitFor(() => expect(saveButton).toBeEnabled());
      expect(await getOidcPutCalls()).toHaveLength(1);
    });

    it("holds the switch until the providers refetch after the write lands", async () => {
      await setup({ providers: [EXISTING_PROVIDER], readDelay: 200 });

      await userEvent.click(groupMappingSwitch());
      expect(await screen.findByText("Changes saved")).toBeInTheDocument();

      expect(groupMappingSwitch()).toBeChecked();
      expect(groupMappingSwitch()).toHaveAttribute("aria-disabled", "true");
      await waitFor(() =>
        expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled"),
      );
      expect(groupMappingSwitch()).toBeChecked();
    });

    it("drops an unsaved group attribute edit when group mapping is turned off", async () => {
      await setup({
        providers: [
          {
            ...MAPPED_PROVIDER,
            "group-sync": {
              ...MAPPED_PROVIDER["group-sync"],
              "group-attribute": "roles",
            },
          },
        ],
      });
      const saveButton = () =>
        screen.getByRole("button", { name: "Save changes" });
      const attributeInput = () =>
        screen.getByRole("textbox", { name: /Group attribute name/ });

      await userEvent.type(attributeInput(), "X");
      expect(saveButton()).toBeEnabled();

      await userEvent.click(groupMappingSwitch());
      await waitFor(() =>
        expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled"),
      );

      expect(saveButton()).toBeDisabled();
      await userEvent.click(groupMappingSwitch());
      await waitFor(() =>
        expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled"),
      );
      expect(attributeInput()).toHaveValue("roles");
    });

    it("asks only for internal groups, since OIDC users are never tenants", async () => {
      await setup({ providers: [MAPPED_PROVIDER] });

      await clickWhenEnabled(screen.getByRole("button", { name: "New" }));
      await userEvent.click(
        screen.getByPlaceholderText("Pick Metabase group..."),
      );
      expect(
        await screen.findByRole("option", { name: "Engineering" }),
      ).toBeInTheDocument();
      const groupRequests = (await findRequests("GET")).filter(({ url }) =>
        url.includes("/api/permissions/group"),
      );
      expect(groupRequests.length).toBeGreaterThan(0);
      expect(
        groupRequests.every(({ url }) => url.includes("tenancy=internal")),
      ).toBe(true);
    });

    it("keeps the editor read-only and the switch held while its mapping saves", async () => {
      const gate = defer<void>();
      await setup({ providers: [MAPPED_PROVIDER], writeGate: gate.promise });

      await addMapping("devs", "Engineering");

      try {
        expect(groupMappingSwitch()).toHaveAttribute("aria-disabled", "true");
        const nameInput = screen.getByPlaceholderText(OIDC_GROUP_PLACEHOLDER);
        const groupsInput = screen.getByLabelText("Metabase groups");
        expect(nameInput).toHaveAttribute("readonly");
        expect(groupsInput).toHaveAttribute("readonly");
        await userEvent.type(nameInput, "-team");
        expect(nameInput).toHaveValue("devs");
        // a read-only picker still drops its last group on Backspace, which would bring its placeholder back
        await userEvent.type(groupsInput, "{Backspace}");
        expect(
          screen.queryByPlaceholderText("Pick Metabase group..."),
        ).not.toBeInTheDocument();
      } finally {
        gate.resolve();
      }
      expect(await screen.findByText("Mapping added")).toBeInTheDocument();
      await waitFor(() =>
        expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled"),
      );
    });

    it("shows a failed write under the editor without marking the name invalid", async () => {
      await setup({
        providers: [MAPPED_PROVIDER],
        writeStatus: 400,
        writeMessage: "Unable to reach the identity provider",
      });

      await addMapping("devs", "Engineering");

      expect(
        await screen.findByText("Unable to reach the identity provider"),
      ).toHaveAttribute("role", "alert");
      const nameInput = screen.getByPlaceholderText(OIDC_GROUP_PLACEHOLDER);
      expect(nameInput).not.toBeInvalid();
      expect(nameInput).toHaveValue("devs");
      expect(screen.queryByText("Mapping added")).not.toBeInTheDocument();
    });

    it("adds a mapping on its own write and carries it along when the page form saves the group attribute", async () => {
      await setup({ providers: [MAPPED_PROVIDER] });
      const saveButton = screen.getByRole("button", { name: "Save changes" });

      await addMapping("devs", "Engineering");
      expect(await screen.findByText("Mapping added")).toBeInTheDocument();
      expect(
        within(getMappingRow("devs")).getByText("Engineering"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
      expect(saveButton).toBeDisabled();

      const attributeInput = screen.getByRole("textbox", {
        name: /Group attribute name/,
      });
      await userEvent.clear(attributeInput);
      await userEvent.type(attributeInput, "roles");
      await userEvent.click(saveButton);

      await waitFor(async () => {
        expect(await getOidcPutCalls()).toHaveLength(2);
      });
      const [mappingPut, formPut] = await getOidcPutCalls();
      expect(mappingPut.body).toEqual({
        "group-sync": {
          enabled: true,
          "group-attribute": "groups",
          "group-mappings": { admins: [2], devs: [3] },
        },
      });
      expect(formPut.body["group-sync"]).toEqual({
        enabled: true,
        "group-attribute": "roles",
        "group-mappings": { admins: [2], devs: [3] },
      });
    });

    it("holds the switch and the page save until the delete-groups cascade finishes", async () => {
      const groupDeleteGate = defer<void>();
      await setup({
        providers: [
          {
            ...EXISTING_PROVIDER,
            "group-sync": {
              enabled: true,
              "group-attribute": "groups",
              "group-mappings": { old: [4], devs: [4, 3] },
            },
          },
        ],
        groupDeleteGate: groupDeleteGate.promise,
      });
      const saveButton = () =>
        screen.getByRole("button", { name: "Save changes" });
      await userEvent.type(
        screen.getByRole("textbox", { name: /Group attribute name/ }),
        "X",
      );
      expect(saveButton()).toBeEnabled();

      await clickWhenEnabled(
        within(getMappingRow("old")).getByRole("button", {
          name: "Delete mapping",
        }),
      );
      await userEvent.click(
        await screen.findByRole("radio", { name: /Also delete the group/ }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Remove mapping and delete group" }),
      );

      try {
        await waitFor(() => expect(queryMappingRow("old")).toBeUndefined());
        // let the refetch settle, so only the cascade can still be holding the controls
        await act(async () => {
          await delay(100);
        });
        expect(groupMappingSwitch()).toHaveAttribute("aria-disabled", "true");
        expect(saveButton()).toBeDisabled();
      } finally {
        groupDeleteGate.resolve();
      }
      expect(await screen.findByText("Mapping deleted")).toBeInTheDocument();
      await waitFor(() =>
        expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled"),
      );
      expect(saveButton()).toBeEnabled();
      const puts = await getOidcPutCalls();
      expect(puts.map(({ body }) => body["group-sync"])).toEqual([
        expect.objectContaining({ "group-mappings": { devs: [4, 3] } }),
        expect.objectContaining({ "group-mappings": { devs: [3] } }),
      ]);
    });
  });
});
