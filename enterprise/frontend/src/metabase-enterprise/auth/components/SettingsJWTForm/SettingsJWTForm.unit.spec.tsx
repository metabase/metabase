import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupGenerateRandomTokenEndpoint,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { settingsApi } from "metabase/settings";
import type { SettingDefinition } from "metabase-types/api";
import { createMockGroup, createMockSettings } from "metabase-types/api/mocks";

import { SettingsJWTForm } from "./SettingsJWTForm";

const GROUPS = [
  createMockGroup(),
  createMockGroup({ id: 2, name: "Administrators", magic_group_type: "admin" }),
  createMockGroup({ id: 3, name: "foo", magic_group_type: null }),
  createMockGroup({ id: 4, name: "bar", magic_group_type: null }),
  createMockGroup({ id: 5, name: "flamingos", magic_group_type: null }),
];

const setup = async ({
  jwtEnabled,
  useTenants,
  configured,
  attributesConfigured,
  attributesEnvConfigured,
  tenantAttributeConfigured,
  groupSync,
  groupMappings,
  groupSyncEnvConfigured,
  groupMappingsEnvConfigured,
  saveStatus,
  saveDelayMs,
  cascadeStatus,
  cascadeDelayMs,
}: {
  jwtEnabled?: boolean;
  useTenants?: boolean;
  configured?: boolean;
  attributesConfigured?: boolean;
  attributesEnvConfigured?: boolean;
  tenantAttributeConfigured?: boolean;
  groupSync?: boolean;
  groupMappings?: Record<string, number[]>;
  groupSyncEnvConfigured?: boolean;
  groupMappingsEnvConfigured?: boolean;
  saveStatus?: number;
  saveDelayMs?: number;
  cascadeStatus?: number;
  cascadeDelayMs?: number;
} = {}) => {
  const settingDefinitions: SettingDefinition[] = [
    { key: "use-tenants", value: useTenants ?? false },
    { key: "jwt-enabled", value: jwtEnabled ?? false },
    ...(groupSyncEnvConfigured
      ? ([
          {
            key: "jwt-group-sync",
            is_env_setting: true,
            env_name: "MB_JWT_GROUP_SYNC",
          },
        ] as const)
      : ([{ key: "jwt-group-sync", value: groupSync ?? false }] as const)),
    ...(groupMappingsEnvConfigured
      ? ([
          {
            key: "jwt-group-mappings",
            is_env_setting: true,
            env_name: "MB_JWT_GROUP_MAPPINGS",
          },
        ] as const)
      : ([{ key: "jwt-group-mappings", value: groupMappings ?? {} }] as const)),
    ...(configured
      ? ([
          { key: "jwt-identity-provider-uri", value: "http://example.com" },
          { key: "jwt-shared-secret", value: "590ab155f412d477b8ab9c8b0e7b" },
        ] as const)
      : []),
    ...(attributesConfigured
      ? ([{ key: "jwt-attribute-email", value: "email-key" }] as const)
      : []),
    ...(attributesEnvConfigured
      ? ([
          {
            key: "jwt-attribute-email",
            is_env_setting: true,
            env_name: "MB_JWT_ATTRIBUTE_EMAIL",
          },
        ] as const)
      : []),
    ...(tenantAttributeConfigured
      ? ([{ key: "jwt-attribute-tenant", value: "tenant-key" }] as const)
      : []),
  ];
  // session properties carry the effective values, and the stateful store reflects live writes on refetch, admin list included
  const sessionSettings = createMockSettings({
    "use-tenants": useTenants,
    "jwt-enabled": jwtEnabled,
    "jwt-group-sync": groupSync ?? false,
    "jwt-group-mappings": groupMappings ?? {},
  });
  const settingsStore = setupStatefulSettingsEndpoints(sessionSettings);
  // the shared helper keeps the admin list static, so serve it here with whatever the store has changed since setup
  const initialSettings = { ...settingsStore };
  fetchMock.get(
    "path:/api/setting",
    () => {
      const written = Object.fromEntries(
        Object.entries(settingsStore).filter(
          ([key, value]) => value !== initialSettings[key],
        ),
      );
      const listed = new Set<string>(
        settingDefinitions.map((definition) => definition.key),
      );
      return [
        ...settingDefinitions.map((definition) =>
          definition.key in written
            ? { ...definition, value: written[definition.key] }
            : definition,
        ),
        ...Object.entries(written)
          .filter(([key]) => !listed.has(key))
          .map(([key, value]) => ({ key, value })),
      ];
    },
    { name: "settings-list" },
  );
  if (saveStatus != null || saveDelayMs != null) {
    // a failed write leaves the store alone, and a slow one lands in it once it resolves
    const status = saveStatus ?? 204;
    fetchMock.removeRoute("update-settings");
    fetchMock.put(
      "path:/api/setting",
      ({ options }) => {
        if (status < 300) {
          Object.assign(settingsStore, JSON.parse(String(options.body)));
        }
        return { status };
      },
      { name: "update-settings", delay: saveDelayMs },
    );
  }
  setupGenerateRandomTokenEndpoint("1234abcd");

  fetchMock.get("path:/api/permissions/group", GROUPS);
  fetchMock.put(
    "express:/api/permissions/membership/:id/clear",
    cascadeStatus ?? 204,
    { delay: cascadeDelayMs },
  );
  fetchMock.delete("express:/api/permissions/group/:id", cascadeStatus ?? 204, {
    delay: cascadeDelayMs,
  });

  const { store } = renderWithProviders(<SettingsJWTForm />, {
    withUndos: true,
    storeInitialState: createMockState({
      settings: createMockSettingsState(sessionSettings),
    }),
  });

  await screen.findByText("Server settings");
  return { store, settingsStore };
};

const expandUserAttributeSection = async () => {
  await userEvent.click(
    await screen.findByRole("button", { name: /User attribute configuration/ }),
  );
};

const addMapping = async (name: string, groupName: string) => {
  await userEvent.click(screen.getByRole("button", { name: "New mapping" }));
  await userEvent.type(screen.getByPlaceholderText("Enter JWT group..."), name);
  await userEvent.click(screen.getByPlaceholderText("Pick Metabase group..."));
  await userEvent.click(await screen.findByRole("option", { name: groupName }));
  await userEvent.click(screen.getByRole("button", { name: "Add mapping" }));
};

const findMappingRow = (name: string) =>
  screen
    .getAllByTestId("jwt-group-mapping-row")
    .find((row) => within(row).queryByText(name) != null);

describe("SettingsJWTForm", () => {
  const ATTRS = {
    "jwt-identity-provider-uri": "http://example.com",
    "jwt-shared-secret":
      "590ab155f412d477b8ab9c8b0e7b2e3ab4d4523e83770a724a2088edbde7f19a",
    "jwt-attribute-email": "john@example.com",
    "jwt-attribute-firstname": "John",
    "jwt-attribute-lastname": "Doe",
    "jwt-attribute-groups": "grouper",
    "jwt-enabled": true,
    "jwt-group-sync": true,
  };

  const fillServerSettings = async () => {
    await userEvent.type(
      await screen.findByRole("textbox", { name: /JWT Identity Provider URI/ }),
      ATTRS["jwt-identity-provider-uri"],
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /Set up key/ }),
    );
    await userEvent.clear(await screen.findByLabelText(/New secret key/));
    await userEvent.type(
      await screen.findByLabelText(/New secret key/),
      ATTRS["jwt-shared-secret"],
    );
    await userEvent.click(await screen.findByRole("button", { name: /Done/ }));
  };

  it("should submit the correct payload", async () => {
    await setup();

    await fillServerSettings();

    await userEvent.click(await screen.findByRole("button", { name: /Save/ }));

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    // it's strange that there's no special JWT endpoint when other SSO methods have endpoints with fancy validation 🤷‍♀️
    expect(url).toMatch(/\/api\/setting$/);
    // per the design, the first save turns automatic group mapping on
    expect(body).toEqual({
      "jwt-identity-provider-uri": ATTRS["jwt-identity-provider-uri"],
      "jwt-shared-secret": ATTRS["jwt-shared-secret"],
      "jwt-enabled": true,
      "jwt-group-sync": true,
      "jwt-group-mappings": {},
    });
  });

  it("enables the attribute and group mapping cards once the server settings are saved", async () => {
    await setup();
    const attributeHeader = screen.getByRole("button", {
      name: /User attribute configuration/,
    });
    expect(attributeHeader).toBeDisabled();

    await fillServerSettings();
    await userEvent.click(
      screen.getByRole("button", { name: /Save and enable/ }),
    );

    await waitFor(() => expect(attributeHeader).toBeEnabled());
    expect(screen.getByRole("radio", { name: "Automatic" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Automatic" })).toBeEnabled();
    expect(
      screen.getByText(/Users will be assigned to Metabase groups/),
    ).toBeInTheDocument();
  });

  it("saves the attribute keys once the server settings exist", async () => {
    await setup({ jwtEnabled: true, configured: true });

    await expandUserAttributeSection();
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Email attribute/ }),
      ATTRS["jwt-attribute-email"],
    );
    await userEvent.type(
      await screen.findByRole("textbox", { name: /First name attribute/ }),
      ATTRS["jwt-attribute-firstname"],
    );
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Last name attribute/ }),
      ATTRS["jwt-attribute-lastname"],
    );
    await userEvent.type(
      await screen.findByRole("textbox", {
        name: /Group assignment attribute/,
      }),
      ATTRS["jwt-attribute-groups"],
    );

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const [{ body }] = await findRequests("PUT");
    expect(body).toMatchObject({
      "jwt-attribute-email": ATTRS["jwt-attribute-email"],
      "jwt-attribute-firstname": ATTRS["jwt-attribute-firstname"],
      "jwt-attribute-lastname": ATTRS["jwt-attribute-lastname"],
      "jwt-attribute-groups": ATTRS["jwt-attribute-groups"],
      "jwt-enabled": true,
    });
    expect(body).not.toHaveProperty("jwt-group-sync");
  });

  it("shows a toast after saving", async () => {
    await setup({ jwtEnabled: true, configured: true });

    await userEvent.type(
      await screen.findByRole("textbox", { name: /JWT Identity Provider URI/ }),
      "/extra",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Save changes" }),
    );

    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
  });

  it("collapses the user attribute section when no attribute is set", async () => {
    await setup();

    expect(
      await screen.findByRole("button", {
        name: /User attribute configuration/,
      }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("expands the user attribute section when an attribute is set", async () => {
    await setup({ configured: true, attributesConfigured: true });

    expect(
      await screen.findByRole("button", {
        name: /User attribute configuration/,
      }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("textbox", { name: /Email attribute/ }),
    ).toBeVisible();
  });

  it("expands the user attribute section when attributes are set via env vars", async () => {
    await setup({ configured: true, attributesEnvConfigured: true });

    expect(
      await screen.findByRole("button", {
        name: /User attribute configuration/,
      }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the user attribute section collapsed while the server settings are missing, even with env-set attributes", async () => {
    await setup({ attributesEnvConfigured: true });

    const header = await screen.findByRole("button", {
      name: /User attribute configuration/,
    });
    expect(header).toBeDisabled();
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("textbox", { name: /Email attribute/, hidden: true }),
    ).not.toBeVisible();
  });

  it("ignores a tenant attribute for the default-open check when tenants are off", async () => {
    await setup({ tenantAttributeConfigured: true });

    expect(
      await screen.findByRole("button", {
        name: /User attribute configuration/,
      }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("should not show tenant attribute unless tenanting is on", async () => {
    await setup();

    expect(
      screen.queryByText(/Tenant assignment attribute/),
    ).not.toBeInTheDocument();
  });

  it("should show tenant attribute when tenanting is on", async () => {
    await setup({ useTenants: true, jwtEnabled: true, configured: true });

    await expandUserAttributeSection();
    await userEvent.type(
      await screen.findByRole("textbox", {
        name: /Tenant assignment attribute/,
      }),
      "Cat",
    );

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;

    expect(url).toMatch(/\/api\/setting$/);
    expect(body).toHaveProperty("jwt-attribute-tenant", "Cat");
  });

  it("User provisioning should not appear if JWT has not been enabled", async () => {
    await setup({ jwtEnabled: false });

    const saveButton = await screen.findByRole("button", {
      name: "Save and enable",
    });
    expect(saveButton).toBeDisabled();

    expect(screen.queryByText(/user provisioning/i)).not.toBeInTheDocument();
  });

  it("User provisioning should appear if JWT has been enabled", async () => {
    await setup({ jwtEnabled: true });

    const saveButton = await screen.findByRole("button", {
      name: "Save changes",
    });
    expect(saveButton).toBeDisabled();

    expect(screen.getByText(/user provisioning/i)).toBeInTheDocument();
  });

  describe("group mapping", () => {
    it("keeps the attribute and group mapping cards disabled until the server settings are saved", async () => {
      await setup();

      expect(
        screen.getByRole("button", { name: /User attribute configuration/ }),
      ).toBeDisabled();
      expect(screen.getByRole("radio", { name: "Off" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Off" })).toBeDisabled();
      expect(
        screen.queryByText(/Users will be assigned to Metabase groups/),
      ).not.toBeInTheDocument();
    });

    it("derives the stored mode when JWT is paused but already configured", async () => {
      await setup({
        jwtEnabled: false,
        configured: true,
        groupSync: true,
        groupMappings: { "group-a": [3] },
      });

      expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Manual" })).toBeEnabled();
      expect(screen.getByTestId("jwt-group-mapping-row")).toBeInTheDocument();
    });

    it("derives off mode when group sync is disabled", async () => {
      await setup({ jwtEnabled: true, configured: true });

      expect(screen.getByRole("radio", { name: "Off" })).toBeChecked();
    });

    it("derives manual mode and lists mappings when mappings are stored", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { "group-a": [3] },
      });

      expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();
      const row = screen.getByTestId("jwt-group-mapping-row");
      expect(within(row).getByText("group-a")).toBeInTheDocument();
      expect(await within(row).findByText("foo")).toBeInTheDocument();
    });

    it("writes a new mapping immediately without touching the page form", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { existing: [3] },
      });

      await addMapping("devs", "bar");

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      const [{ body }] = puts;
      expect(body).toEqual({
        "jwt-group-sync": true,
        "jwt-group-mappings": { existing: [3], devs: [4] },
      });
      expect(await screen.findByText("Mapping added")).toBeInTheDocument();
      expect(
        await screen.findAllByTestId("jwt-group-mapping-row"),
      ).toHaveLength(2);
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();
    });

    it("turns off after the last mapping is deleted even if manual was pending before a refetch brought mappings in", async () => {
      const { store, settingsStore } = await setup({
        jwtEnabled: true,
        configured: true,
      });

      await userEvent.click(screen.getByRole("radio", { name: "Manual" }));
      expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();

      // another admin set a mapping up meanwhile, and a refetch brings it in
      Object.assign(settingsStore, {
        "jwt-group-sync": true,
        "jwt-group-mappings": { other: [3] },
      });
      act(() => {
        store.dispatch(settingsApi.util.invalidateTags(["session-properties"]));
      });
      await waitFor(() => expect(findMappingRow("other")).toBeDefined());

      await userEvent.click(
        screen.getByRole("button", { name: "Delete mapping" }),
      );
      await userEvent.click(
        await screen.findByRole("button", { name: "Remove mapping" }),
      );

      expect(
        await screen.findByText("Mapping deleted and group mapping turned off"),
      ).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Off" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Manual" })).not.toBeChecked();
    });

    it("keeps manual pending until the first mapping is added", async () => {
      await setup({ jwtEnabled: true, configured: true, groupSync: true });

      expect(screen.getByRole("radio", { name: "Automatic" })).toBeChecked();
      await userEvent.click(screen.getByRole("radio", { name: "Manual" }));

      expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();
      expect(
        screen.getByText(
          "Add at least one mapping to use manual group mapping",
        ),
      ).toBeInTheDocument();
      expect(await findRequests("PUT")).toHaveLength(0);

      await addMapping("devs", "bar");

      const [{ body }] = await findRequests("PUT");
      expect(body).toEqual({
        "jwt-group-sync": true,
        "jwt-group-mappings": { devs: [4] },
      });
    });

    it("turns sync off and back on without touching the stored mappings", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { existing: [3] },
      });

      await userEvent.click(screen.getByRole("radio", { name: "Off" }));

      await waitFor(() => {
        expect(screen.getByRole("radio", { name: "Off" })).toBeChecked();
      });
      expect(await findRequests("PUT")).toHaveLength(1);
      expect(
        screen.queryByTestId("jwt-group-mapping-row"),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("radio", { name: "Manual" }));

      await waitFor(() => {
        expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();
      });
      expect(
        await screen.findByTestId("jwt-group-mapping-row"),
      ).toHaveTextContent("existing");
      const puts = await findRequests("PUT");
      expect(puts.map(({ body }) => body)).toEqual([
        { "jwt-group-sync": false },
        { "jwt-group-sync": true },
      ]);
    });

    it("deletes a mapping and clears its groups right away", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { admins: [4], devs: [3] },
      });

      await userEvent.click(
        within(findMappingRow("admins")!).getByRole("button", {
          name: "Delete mapping",
        }),
      );
      await userEvent.click(
        await screen.findByRole("radio", { name: /Also remove all members/ }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Remove mapping and members" }),
      );

      expect(await screen.findByText("Mapping deleted")).toBeInTheDocument();
      const puts = await findRequests("PUT");
      const settingsIndex = puts.findIndex(({ url }) =>
        /\/api\/setting$/.test(url),
      );
      const clearIndex = puts.findIndex(({ url }) =>
        url.includes("/api/permissions/membership/4/clear"),
      );
      expect(puts[settingsIndex].body).toEqual({
        "jwt-group-mappings": { devs: [3] },
      });
      // the cascade runs only after the mapping was removed
      expect(clearIndex).toBeGreaterThan(settingsIndex);
      expect(
        puts.some(({ url }) =>
          url.includes("/api/permissions/membership/3/clear"),
        ),
      ).toBe(false);
      await waitFor(() => {
        expect(findMappingRow("admins")).toBeUndefined();
      });
    });

    it("deletes a mapping and its groups right away", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { old: [4], devs: [3] },
      });

      await userEvent.click(
        within(findMappingRow("old")!).getByRole("button", {
          name: "Delete mapping",
        }),
      );
      await userEvent.click(
        await screen.findByRole("radio", { name: /Also delete the group/ }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Remove mapping and delete group" }),
      );

      expect(await screen.findByText("Mapping deleted")).toBeInTheDocument();
      const deletes = await findRequests("DELETE");
      expect(
        deletes.some(({ url }) => url.includes("/api/permissions/group/4")),
      ).toBe(true);
    });

    it("reports a failed cascade once and skips the success toast", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { old: [4, 5], devs: [3] },
        cascadeStatus: 500,
      });

      await userEvent.click(
        within(findMappingRow("old")!).getByRole("button", {
          name: "Delete mapping",
        }),
      );
      await userEvent.click(
        await screen.findByRole("radio", { name: /Also delete the groups/ }),
      );
      await userEvent.click(
        screen.getByRole("button", {
          name: "Remove mapping and delete groups",
        }),
      );

      expect(
        await screen.findAllByText(
          "Mapping deleted, but not all of its groups could be updated",
        ),
      ).toHaveLength(1);
      expect(screen.queryByText("Mapping deleted")).not.toBeInTheDocument();
      const deletes = await findRequests("DELETE");
      expect(deletes).toHaveLength(2);
      await waitFor(() => {
        expect(findMappingRow("old")).toBeUndefined();
      });
    });

    it("keeps the editor open and reports the error when the write fails", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { existing: [3] },
        saveStatus: 500,
      });

      await addMapping("devs", "bar");

      expect(
        await screen.findByText("Error saving group mapping"),
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Enter JWT group...")).toHaveValue(
        "devs",
      );
      expect(screen.getByRole("button", { name: "Add mapping" })).toBeEnabled();
      expect(screen.getAllByTestId("jwt-group-mapping-row")).toHaveLength(1);
      expect(screen.queryByText("Mapping added")).not.toBeInTheDocument();
    });

    it("keeps the mapping and skips the cascade when the delete write fails", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { old: [4], devs: [3] },
        saveStatus: 500,
      });

      await userEvent.click(
        within(findMappingRow("old")!).getByRole("button", {
          name: "Delete mapping",
        }),
      );
      await userEvent.click(
        await screen.findByRole("radio", { name: /Also delete the group/ }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Remove mapping and delete group" }),
      );

      expect(
        await screen.findByText("Error saving group mapping"),
      ).toBeInTheDocument();
      expect(findMappingRow("old")).toBeDefined();
      expect(await findRequests("DELETE")).toHaveLength(0);
      expect(screen.queryByText(/Mapping deleted/)).not.toBeInTheDocument();
    });

    it("keeps the stored mode when switching it fails", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { existing: [3] },
        saveStatus: 500,
      });

      await userEvent.click(screen.getByRole("radio", { name: "Off" }));

      expect(
        await screen.findByText("Error saving group mapping"),
      ).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Manual" })).toBeEnabled();
      expect(findMappingRow("existing")).toBeDefined();
    });

    it("disables the new mapping button while a save is in flight", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { existing: [3] },
        saveDelayMs: 300,
      });

      await addMapping("devs", "bar");

      expect(
        screen.getByRole("button", { name: "New mapping" }),
      ).toBeDisabled();
      expect(
        await screen.findByText("Mapping added", {}, { timeout: 3000 }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "New mapping" })).toBeEnabled();
    });

    it("keeps the controls disabled until the cascade finishes", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { old: [4], devs: [3] },
        cascadeDelayMs: 300,
      });

      await userEvent.click(
        within(findMappingRow("old")!).getByRole("button", {
          name: "Delete mapping",
        }),
      );
      await userEvent.click(
        await screen.findByRole("radio", { name: /Also delete the group/ }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Remove mapping and delete group" }),
      );

      // the mapping write is done once the row is gone, while the group delete is still in flight
      await waitFor(() => expect(findMappingRow("old")).toBeUndefined());
      expect(
        within(findMappingRow("devs")!).getByRole("button", {
          name: "Delete mapping",
        }),
      ).toBeDisabled();
      expect(screen.getByRole("radio", { name: "Off" })).toBeDisabled();

      expect(
        await screen.findByText("Mapping deleted", {}, { timeout: 3000 }),
      ).toBeInTheDocument();
      expect(
        within(findMappingRow("devs")!).getByRole("button", {
          name: "Delete mapping",
        }),
      ).toBeEnabled();
      expect(screen.getByRole("radio", { name: "Off" })).toBeEnabled();
    });

    it("drops deleted groups from the other mappings in the same write", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { old: [4], devs: [4, 3] },
      });

      await userEvent.click(
        within(findMappingRow("old")!).getByRole("button", {
          name: "Delete mapping",
        }),
      );
      await userEvent.click(
        await screen.findByRole("radio", { name: /Also delete the group/ }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Remove mapping and delete group" }),
      );

      expect(await screen.findByText("Mapping deleted")).toBeInTheDocument();
      const puts = await findRequests("PUT");
      const settingsPut = puts.find(({ url }) => /\/api\/setting$/.test(url));
      expect(settingsPut?.body).toEqual({
        "jwt-group-mappings": { devs: [3] },
      });
    });

    it("edits a mapping without the ids of groups that no longer exist", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { devs: [9, 3] },
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Edit mapping" }),
      );

      expect(screen.getByText("foo")).toBeInTheDocument();
      expect(screen.queryByText("9")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      const [{ body }] = await findRequests("PUT");
      expect(body["jwt-group-mappings"]).toEqual({ devs: [3] });
    });

    it("turns group mapping off when the last mapping is deleted", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { only: [3] },
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Delete mapping" }),
      );
      expect(
        await screen.findByText(
          "This is the last mapping, so group mapping will be turned off.",
        ),
      ).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Remove mapping" }),
      );

      expect(
        await screen.findByText("Mapping deleted and group mapping turned off"),
      ).toBeInTheDocument();
      const [{ body }] = await findRequests("PUT");
      expect(body).toEqual({
        "jwt-group-mappings": {},
        "jwt-group-sync": false,
      });
      await waitFor(() => {
        expect(screen.getByRole("radio", { name: "Off" })).toBeChecked();
      });
    });

    it("keeps a renamed mapping in place and rejects duplicate names", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { first: [3], second: [4] },
      });

      await userEvent.click(
        within(findMappingRow("second")!).getByRole("button", {
          name: "Edit mapping",
        }),
      );
      const nameInput = screen.getByLabelText("JWT group name");
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "first");

      expect(
        screen.getByText("A mapping for this group already exists"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "second-renamed");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("Mapping updated")).toBeInTheDocument();
      const [{ body }] = await findRequests("PUT");
      expect(body["jwt-group-mappings"]).toEqual({
        first: [3],
        "second-renamed": [4],
      });
      const names = screen
        .getAllByTestId("jwt-group-mapping-row")
        .map((row) => within(row).getAllByText(/./)[0].textContent);
      expect(names).toEqual(["first", "second-renamed"]);
    });

    it("allows mapping names that collide with object prototype members", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { existing: [3] },
      });

      await userEvent.click(
        screen.getByRole("button", { name: "New mapping" }),
      );
      await userEvent.type(
        screen.getByPlaceholderText("Enter JWT group..."),
        "constructor",
      );
      await userEvent.click(
        screen.getByPlaceholderText("Pick Metabase group..."),
      );
      await userEvent.click(await screen.findByRole("option", { name: "bar" }));

      expect(
        screen.queryByText("A mapping for this group already exists"),
      ).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Add mapping" }),
      );

      expect(
        await screen.findAllByTestId("jwt-group-mapping-row"),
      ).toHaveLength(2);
    });

    it("commits the row editor on Enter instead of submitting the page", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { existing: [3] },
      });

      // a dirty page form has a live Save button, so Enter could submit it
      await userEvent.type(
        screen.getByRole("textbox", { name: /JWT Identity Provider URI/ }),
        "/v2",
      );
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeEnabled();

      await userEvent.click(
        screen.getByRole("button", { name: "New mapping" }),
      );
      const nameInput = screen.getByPlaceholderText("Enter JWT group...");
      await userEvent.type(nameInput, "devs");
      await userEvent.click(
        screen.getByPlaceholderText("Pick Metabase group..."),
      );
      await userEvent.click(await screen.findByRole("option", { name: "bar" }));
      await userEvent.click(nameInput);
      await userEvent.keyboard("{Enter}");

      await waitFor(() => {
        expect(
          screen.queryByPlaceholderText("Enter JWT group..."),
        ).not.toBeInTheDocument();
      });
      expect(screen.getAllByTestId("jwt-group-mapping-row")).toHaveLength(2);
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].body).not.toHaveProperty("jwt-identity-provider-uri");
    });

    it("cancels the row editor on Escape", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { existing: [3] },
      });

      await userEvent.click(
        screen.getByRole("button", { name: "New mapping" }),
      );
      await userEvent.type(
        screen.getByPlaceholderText("Enter JWT group..."),
        "temp{Escape}",
      );

      expect(
        screen.queryByPlaceholderText("Enter JWT group..."),
      ).not.toBeInTheDocument();
      expect(screen.getAllByTestId("jwt-group-mapping-row")).toHaveLength(1);
      expect(await findRequests("PUT")).toHaveLength(0);
    });

    it("confirms admin-only and zero-group deletions without offering cascades", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { admins: [2], legacy: [], devs: [3] },
      });

      await userEvent.click(
        within(findMappingRow("admins")!).getByRole("button", {
          name: "Delete mapping",
        }),
      );
      const adminsModal = await screen.findByRole("dialog");
      expect(
        within(adminsModal).getByText("Remove this group mapping?"),
      ).toBeInTheDocument();
      expect(
        within(adminsModal).getByText(
          "The Administrators group is not affected.",
        ),
      ).toBeInTheDocument();
      expect(within(adminsModal).queryByRole("radio")).not.toBeInTheDocument();
      await userEvent.click(
        within(adminsModal).getByRole("button", { name: "Remove mapping" }),
      );
      await waitFor(() => {
        expect(findMappingRow("admins")).toBeUndefined();
      });

      await userEvent.click(
        within(findMappingRow("legacy")!).getByRole("button", {
          name: "Delete mapping",
        }),
      );
      const legacyModal = await screen.findByRole("dialog");
      expect(
        within(legacyModal).getByText(
          "This mapping isn't linked to any group.",
        ),
      ).toBeInTheDocument();
      expect(within(legacyModal).queryByRole("radio")).not.toBeInTheDocument();
      await userEvent.click(
        within(legacyModal).getByRole("button", { name: "Remove mapping" }),
      );
      await waitFor(() => {
        expect(findMappingRow("legacy")).toBeUndefined();
      });

      await userEvent.click(
        within(findMappingRow("devs")!).getByRole("button", {
          name: "Delete mapping",
        }),
      );
      const devsModal = await screen.findByRole("dialog");
      expect(within(devsModal).getAllByRole("radio")).toHaveLength(3);
      const puts = await findRequests("PUT");
      expect(puts.map(({ body }) => body["jwt-group-mappings"])).toEqual([
        { legacy: [], devs: [3] },
        { devs: [3] },
      ]);
    });

    it("names the mode control and the editor inputs for assistive tech", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { existing: [3] },
      });

      expect(
        screen.getByRole("radiogroup", { name: "Group mapping mode" }),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "New mapping" }),
      );

      expect(screen.getByLabelText("JWT group name")).toBeInTheDocument();
      expect(screen.getByLabelText("Metabase groups")).toBeInTheDocument();
    });

    it("asks for confirmation before switching to automatic and stays manual on cancel", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { "group-a": [3] },
      });

      await userEvent.click(screen.getByRole("radio", { name: "Automatic" }));

      expect(
        await screen.findByText("Switch to automatic group mapping?"),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(
        screen.queryByText("Switch to automatic group mapping?"),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();
      expect(await findRequests("PUT")).toHaveLength(0);
    });

    it("switches to automatic and deletes the stored mappings on confirmation", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { "group-a": [3] },
      });

      await userEvent.click(screen.getByRole("radio", { name: "Automatic" }));
      await userEvent.click(
        await screen.findByRole("button", {
          name: "Delete mappings and switch",
        }),
      );

      await waitFor(() => {
        expect(screen.getByRole("radio", { name: "Automatic" })).toBeChecked();
      });
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].body).toEqual({
        "jwt-group-sync": true,
        "jwt-group-mappings": {},
      });
      expect(
        screen.queryByTestId("jwt-group-mapping-row"),
      ).not.toBeInTheDocument();
    });

    it("keeps the confirmation busy until the automatic switch is saved", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { "group-a": [3] },
        saveDelayMs: 300,
      });

      await userEvent.click(screen.getByRole("radio", { name: "Automatic" }));
      const confirmButton = await screen.findByRole("button", {
        name: "Delete mappings and switch",
      });
      await userEvent.dblClick(confirmButton);

      expect(confirmButton).toBeDisabled();
      expect(
        screen.getByText("Switch to automatic group mapping?"),
      ).toBeInTheDocument();

      await waitFor(
        () => {
          expect(
            screen.queryByText("Switch to automatic group mapping?"),
          ).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );
      expect(await findRequests("PUT")).toHaveLength(1);
    });

    it("keeps the confirmation open when the automatic switch fails to save", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { "group-a": [3] },
        saveStatus: 500,
      });

      await userEvent.click(screen.getByRole("radio", { name: "Automatic" }));
      const confirmButton = await screen.findByRole("button", {
        name: "Delete mappings and switch",
      });
      await userEvent.click(confirmButton);

      expect(
        await screen.findByText("Error saving group mapping"),
      ).toBeInTheDocument();
      expect(await findRequests("PUT")).toHaveLength(1);
      expect(
        screen.getByText("Switch to automatic group mapping?"),
      ).toBeInTheDocument();
      expect(confirmButton).toBeEnabled();
      expect(findMappingRow("group-a")).toBeDefined();
    });

    it("locks the section to the values configured through env vars", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { "env-group": [3] },
        groupSyncEnvConfigured: true,
        groupMappingsEnvConfigured: true,
      });

      expect(screen.getByText("Using MB_JWT_GROUP_SYNC")).toBeInTheDocument();
      expect(
        screen.getByText("Using MB_JWT_GROUP_MAPPINGS"),
      ).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Manual" })).toBeDisabled();
      expect(screen.getByTestId("jwt-group-mapping-row")).toHaveTextContent(
        "env-group",
      );
      expect(
        screen.queryByRole("button", { name: "New mapping" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Delete mapping" }),
      ).not.toBeInTheDocument();
    });

    it("locks the section when only the sync flag comes from an env var", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { "stored-group": [3] },
        groupSyncEnvConfigured: true,
      });

      expect(screen.getByText("Using MB_JWT_GROUP_SYNC")).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();
      expect(screen.getByTestId("jwt-group-mapping-row")).toHaveTextContent(
        "stored-group",
      );
      expect(
        screen.queryByRole("button", { name: "Edit mapping" }),
      ).not.toBeInTheDocument();
    });

    it("does not turn sync on with the first save when it is env-configured", async () => {
      await setup({ groupSyncEnvConfigured: true });

      await userEvent.type(
        await screen.findByRole("textbox", {
          name: /JWT Identity Provider URI/,
        }),
        ATTRS["jwt-identity-provider-uri"],
      );
      await userEvent.click(
        await screen.findByRole("button", { name: /Save/ }),
      );

      const [{ body }] = await findRequests("PUT");
      expect(body).not.toHaveProperty("jwt-group-sync");
      expect(body).not.toHaveProperty("jwt-group-mappings");
    });

    it("leaves the group settings alone when saving other fields of a configured setup", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { existing: [3] },
      });

      await userEvent.type(
        screen.getByRole("textbox", { name: /JWT Identity Provider URI/ }),
        "/sso",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Save changes" }),
      );

      const [{ body }] = await findRequests("PUT");
      expect(body["jwt-identity-provider-uri"]).toBe("http://example.com/sso");
      expect(body).not.toHaveProperty("jwt-group-sync");
      expect(body).not.toHaveProperty("jwt-group-mappings");
    });
  });
});
