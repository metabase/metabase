import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupSettingsEndpoints,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type { CustomOidcConfig } from "metabase-enterprise/api";
import { createMockGroup, createMockSettings } from "metabase-types/api/mocks";

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

// the providers live in one setting, so the mock keeps what the page writes and hands it back on refetch
function setupProviderEndpoints(
  initialProviders: CustomOidcConfig[],
  { writeDelay, readDelay, writeStatus }: ProviderDelays = {},
) {
  const providers = initialProviders.map((provider) => ({ ...provider }));

  fetchMock.get(
    "path:/api/ee/sso/oidc",
    () => providers.map((provider) => ({ ...provider })),
    { delay: readDelay },
  );
  fetchMock.post("path:/api/ee/sso/oidc", ({ options }) => {
    const provider = JSON.parse(String(options.body));
    providers.push(provider);
    return provider;
  });
  // the backend merges the body into the stored provider one level deep, so a group-sync map replaces the old one
  fetchMock.put(
    "express:/api/ee/sso/oidc/:key",
    ({ url, options }) => {
      if (writeStatus != null) {
        return { status: writeStatus };
      }
      const key = url.split("/api/ee/sso/oidc/")[1];
      const index = providers.findIndex((provider) => provider.key === key);
      if (index === -1) {
        return { status: 404 };
      }
      providers[index] = {
        ...providers[index],
        ...JSON.parse(String(options.body)),
      };
      return providers[index];
    },
    { delay: writeDelay },
  );
  fetchMock.post("path:/api/ee/sso/oidc/check", {
    ok: true,
    discovery: { step: "discovery", success: true },
    credentials: { step: "credentials", success: true, verified: true },
  });
}

type ProviderDelays = {
  writeDelay?: number;
  readDelay?: number;
  writeStatus?: number;
};

const setup = async ({
  providers = [],
  ...delays
}: { providers?: CustomOidcConfig[] } & ProviderDelays = {}) => {
  setupSettingsEndpoints([]);
  // the provisioning switch reads its value back after saving, so the properties mock has to remember writes
  setupStatefulSettingsEndpoints(createMockSettings());
  fetchMock.get("path:/api/permissions/group", GROUPS);
  fetchMock.put("express:/api/permissions/membership/:id/clear", 204);
  fetchMock.delete("express:/api/permissions/group/:id", 204);
  setupProviderEndpoints(providers, delays);

  renderWithProviders(<SettingsOIDCForm />, { withUndos: true });

  await screen.findByText("OpenID Connect");
};

const getOidcPuts = async () => {
  const puts = await findRequests("PUT");
  return puts.filter(({ url }) => url.includes("/api/ee/sso/oidc/okta"));
};

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
};

const addMapping = async (name: string, groupName: string) => {
  await userEvent.click(screen.getByRole("button", { name: "New" }));
  await userEvent.type(
    screen.getByPlaceholderText(OIDC_GROUP_PLACEHOLDER),
    name,
  );
  await userEvent.click(screen.getByPlaceholderText("Pick Metabase group..."));
  await userEvent.click(await screen.findByRole("option", { name: groupName }));
  await userEvent.click(screen.getByRole("button", { name: "Add mapping" }));
};

describe("SettingsOIDCForm", () => {
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

    it("keeps the cards below the server settings disabled until the provider is saved", async () => {
      await setup();

      expect(
        screen.getByRole("switch", { name: "User provisioning" }),
      ).toBeDisabled();
      expect(screen.getByRole("button", { name: "Attributes" })).toBeDisabled();
      expect(groupMappingSwitch()).toBeDisabled();
      expect(groupMappingSwitch()).not.toBeChecked();
      expect(
        screen.queryByText("Manual group mappings"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("textbox", { name: /Group attribute name/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe("defaults", () => {
    it("shows the defaults as placeholders and leaves the fields empty for a new provider", async () => {
      await setup();
      // the attributes card only opens once a provider exists, so its claims are checked in the test below

      expect(screen.getByLabelText(/^Key/)).toHaveAttribute(
        "placeholder",
        "okta",
      );
      expect(screen.getByLabelText(/^Login prompt/)).toHaveAttribute(
        "placeholder",
        "Sign in with Okta",
      );
      expect(screen.getByLabelText(/^Client ID/)).toHaveAttribute(
        "placeholder",
        "metabase-client-id",
      );
      expect(screen.getByLabelText(/^Client secret/)).toHaveAttribute(
        "placeholder",
        "your-client-secret",
      );
      // scopes live in the server settings card, visible without expanding anything
      const scopes = screen.getByLabelText(/^Scopes/);
      expect(scopes).toBeVisible();
      expect(scopes).toHaveValue("");
      expect(scopes).toHaveAttribute("placeholder", "openid, email, profile");
    });

    it("shows the claim defaults as placeholders once a provider is saved", async () => {
      await setup({
        providers: [{ ...EXISTING_PROVIDER, "attribute-map": {} }],
      });

      await expandAttributes();

      expect(screen.getByLabelText("Email attribute key")).toHaveValue("");
      expect(screen.getByLabelText("Email attribute key")).toHaveAttribute(
        "placeholder",
        "email",
      );
      expect(screen.getByLabelText("First name attribute key")).toHaveAttribute(
        "placeholder",
        "given_name",
      );
      expect(screen.getByLabelText("Last name attribute key")).toHaveAttribute(
        "placeholder",
        "family_name",
      );
    });

    it("shows the group attribute default as a placeholder and leaves the field empty", async () => {
      await setup({ providers: [MAPPED_PROVIDER] });

      const attributeInput = screen.getByRole("textbox", {
        name: /Group attribute name/,
      });
      expect(attributeInput).toHaveValue("");
      expect(attributeInput).toHaveAttribute("placeholder", "groups");
    });

    it("keeps the attributes card collapsed while the stored claims are the defaults", async () => {
      await setup({ providers: [EXISTING_PROVIDER] });

      expect(
        screen.getByRole("button", { name: "Attributes" }),
      ).toHaveAttribute("aria-expanded", "false");
      // stored defaults read as unset, so the placeholders speak for them
      expect(screen.getByLabelText(/^Scopes/)).toHaveValue("");
      expect(screen.getByLabelText(/^Client secret/)).toHaveAttribute(
        "placeholder",
        "Leave blank to keep current value",
      );
    });

    it("opens the attributes card and shows the claim a provider customized", async () => {
      await setup({
        providers: [
          {
            ...EXISTING_PROVIDER,
            scopes: ["openid", "email"],
            "attribute-map": {
              ...EXISTING_PROVIDER["attribute-map"],
              email: "mail",
            },
          },
        ],
      });

      expect(
        screen.getByRole("button", { name: "Attributes" }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByLabelText(/^Scopes/)).toHaveValue("openid, email");
      expect(screen.getByLabelText("Email attribute key")).toHaveValue("mail");
      expect(screen.getByLabelText("First name attribute key")).toHaveValue("");
    });

    it("falls back to the default scopes and claims when the fields stay empty", async () => {
      await setup();
      await fillRequiredFields();

      await userEvent.click(
        screen.getByRole("button", { name: "Save and enable" }),
      );

      await waitFor(async () => {
        expect(await findRequests("POST")).toHaveLength(2);
      });
      const [{ body }] = (await findRequests("POST")).filter(({ url }) =>
        url.endsWith("/api/ee/sso/oidc"),
      );
      expect(body.scopes).toEqual(["openid", "email", "profile"]);
      expect(body["attribute-map"]).toEqual({});
      expect(body.enabled).toBe(true);
      // group mapping starts off and gets its own card once the provider exists
      expect(body["group-sync"]).toEqual({
        enabled: false,
        "group-attribute": "groups",
        "group-mappings": {},
      });
    });
  });

  describe("user provisioning", () => {
    it("comes alive once the provider is saved", async () => {
      await setup({ providers: [EXISTING_PROVIDER] });

      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      await waitFor(() => expect(toggle).toBeEnabled());
    });

    it("saves right away without touching the page form", async () => {
      await setup({ providers: [EXISTING_PROVIDER] });
      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      await waitFor(() => expect(toggle).toBeEnabled());
      expect(toggle).toBeChecked();

      await userEvent.click(toggle);

      await waitFor(() => expect(toggle).not.toBeChecked());
      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toMatch(
        /\/api\/setting\/oidc-user-provisioning-enabled%3F$/,
      );
      expect(puts[0].body).toEqual({ value: false });
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();
    });
  });

  describe("group mapping", () => {
    it("keeps the mappings and the group attribute hidden while group mapping is off", async () => {
      await setup({ providers: [EXISTING_PROVIDER] });

      expect(groupMappingSwitch()).not.toBeChecked();
      expect(
        screen.queryByText("Manual group mappings"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("textbox", { name: /Group attribute name/ }),
      ).not.toBeInTheDocument();
    });

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
      const puts = await getOidcPuts();
      expect(puts).toHaveLength(1);
      // the API swaps the whole group sync map, so the write carries the rest of it along
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
      const puts = await getOidcPuts();
      expect(puts).toHaveLength(1);
      // without an attribute the backend syncs no groups at all, so the default goes out with the switch
      expect(puts[0].body).toEqual({
        "group-sync": {
          enabled: true,
          "group-attribute": "groups",
          "group-mappings": {},
        },
      });
    });

    it("keeps the switch off after a failed write, even while a later refetch runs", async () => {
      await setup({ providers: [EXISTING_PROVIDER], writeStatus: 500 });

      await userEvent.click(groupMappingSwitch());
      expect(
        await screen.findByText(/Error saving group mapping/),
      ).toBeInTheDocument();
      expect(groupMappingSwitch()).not.toBeChecked();

      // the provisioning write refetches the providers, which must not bring the attempted value back
      await userEvent.click(
        screen.getByRole("switch", { name: "User provisioning" }),
      );

      await waitFor(() => expect(groupMappingSwitch()).toBeEnabled());
      expect(groupMappingSwitch()).not.toBeChecked();
    });

    it("holds the switch while a mapping write is in flight", async () => {
      // the whole group sync map goes out with every write, so a click during one would drop the mapping
      await setup({
        providers: [
          {
            ...EXISTING_PROVIDER,
            "group-sync": {
              enabled: true,
              "group-attribute": "groups",
              "group-mappings": {},
            },
          },
        ],
        writeDelay: 200,
      });

      await addMapping("devs", "Engineering");

      expect(groupMappingSwitch()).toBeDisabled();
      expect(await screen.findByText("Mapping added")).toBeInTheDocument();
      await waitFor(() => expect(groupMappingSwitch()).toBeEnabled());
    });

    it("holds the mapping editor while the switch write is in flight", async () => {
      await setup({ providers: [EXISTING_PROVIDER], writeDelay: 200 });

      await userEvent.click(groupMappingSwitch());

      expect(screen.getByRole("button", { name: "New" })).toBeDisabled();
      await waitFor(() => expect(groupMappingSwitch()).toBeEnabled());
      expect(screen.getByRole("button", { name: "New" })).toBeEnabled();
    });

    it("shows the new value and holds the switch while the write is in flight", async () => {
      await setup({ providers: [EXISTING_PROVIDER], writeDelay: 200 });

      await userEvent.click(groupMappingSwitch());

      expect(groupMappingSwitch()).toBeChecked();
      expect(groupMappingSwitch()).toBeDisabled();
      expect(screen.getByText("Manual group mappings")).toBeInTheDocument();
      await waitFor(() => expect(groupMappingSwitch()).toBeEnabled());
      expect(groupMappingSwitch()).toBeChecked();
      expect(await getOidcPuts()).toHaveLength(1);
    });

    it("holds the switch until the providers refetch after the write lands", async () => {
      // the providers mock answers reads late, so the refetch the write triggers can be seen
      await setup({ providers: [EXISTING_PROVIDER], readDelay: 200 });

      await userEvent.click(groupMappingSwitch());
      expect(await screen.findByText("Changes saved")).toBeInTheDocument();

      expect(groupMappingSwitch()).toBeChecked();
      expect(groupMappingSwitch()).toBeDisabled();
      await waitFor(() => expect(groupMappingSwitch()).toBeEnabled());
      expect(groupMappingSwitch()).toBeChecked();
    });

    it("puts the old value back when the write fails", async () => {
      await setup({ providers: [EXISTING_PROVIDER], writeStatus: 500 });

      await userEvent.click(groupMappingSwitch());

      expect(
        await screen.findByText(/Error saving group mapping/),
      ).toBeInTheDocument();
      expect(groupMappingSwitch()).not.toBeChecked();
      expect(groupMappingSwitch()).toBeEnabled();
      expect(
        screen.queryByText("Manual group mappings"),
      ).not.toBeInTheDocument();
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
      await waitFor(() => expect(groupMappingSwitch()).toBeEnabled());

      expect(saveButton()).toBeDisabled();
      await userEvent.click(groupMappingSwitch());
      await waitFor(() => expect(groupMappingSwitch()).toBeEnabled());
      expect(attributeInput()).toHaveValue("roles");
    });

    it("adds a mapping and writes it without touching the page form", async () => {
      await setup({
        providers: [
          {
            ...EXISTING_PROVIDER,
            "group-sync": {
              enabled: true,
              "group-attribute": "groups",
              "group-mappings": {},
            },
          },
        ],
      });

      expect(screen.getByText("No mappings yet")).toBeInTheDocument();
      await addMapping("devs", "Engineering");

      expect(await screen.findByText("Mapping added")).toBeInTheDocument();
      const puts = await getOidcPuts();
      expect(puts).toHaveLength(1);
      expect(puts[0].body).toEqual({
        "group-sync": {
          enabled: true,
          "group-attribute": "groups",
          "group-mappings": { devs: [3] },
        },
      });
      expect(
        within(getMappingRow("devs")).getByText("Engineering"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();
    });

    it("saves the group attribute with the page form and carries the latest mappings along", async () => {
      await setup({ providers: [MAPPED_PROVIDER] });

      await addMapping("devs", "Engineering");
      expect(await screen.findByText("Mapping added")).toBeInTheDocument();

      const attributeInput = screen.getByRole("textbox", {
        name: /Group attribute name/,
      });
      await userEvent.clear(attributeInput);
      await userEvent.type(attributeInput, "roles");
      await userEvent.click(
        screen.getByRole("button", { name: "Save changes" }),
      );

      await waitFor(async () => {
        expect(await getOidcPuts()).toHaveLength(2);
      });
      const [, formPut] = await getOidcPuts();
      expect(formPut.body["group-sync"]).toEqual({
        enabled: true,
        "group-attribute": "roles",
        "group-mappings": { admins: [2], devs: [3] },
      });
    });

    it("keeps group mapping on when the last mapping is deleted", async () => {
      await setup({ providers: [MAPPED_PROVIDER] });

      await userEvent.click(
        screen.getByRole("button", { name: "Delete mapping" }),
      );
      const modal = await screen.findByRole("dialog");
      // JWT warns here that sync turns off with the last mapping; OIDC keeps it on
      expect(
        within(modal).queryByText(/group mapping will be turned off/),
      ).not.toBeInTheDocument();
      await userEvent.click(
        within(modal).getByRole("button", { name: "Remove mapping" }),
      );

      expect(await screen.findByText("Mapping deleted")).toBeInTheDocument();
      const [{ body }] = await getOidcPuts();
      expect(body).toEqual({
        "group-sync": {
          enabled: true,
          "group-attribute": "groups",
          "group-mappings": {},
        },
      });
      expect(groupMappingSwitch()).toBeChecked();
      expect(screen.getByText("No mappings yet")).toBeInTheDocument();
      expect(queryMappingRow("admins")).toBeUndefined();
    });
  });
});
