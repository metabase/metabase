import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupGenerateRandomTokenEndpoint,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import { createMockSettingsState, createMockState } from "__support__/state";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { settingsApi } from "metabase/settings";
import { defer } from "metabase/utils/promise";
import type { SettingDefinition } from "metabase-types/api";
import { createMockGroup, createMockSettings } from "metabase-types/api/mocks";

import { SettingsJWTForm } from "./SettingsJWTForm";

const GROUPS = [
  createMockGroup(),
  createMockGroup({ id: 2, name: "Administrators", magic_group_type: "admin" }),
  createMockGroup({ id: 3, name: "foo", magic_group_type: null }),
  createMockGroup({ id: 4, name: "bar", magic_group_type: null }),
  createMockGroup({ id: 5, name: "flamingos", magic_group_type: null }),
  createMockGroup({
    id: 6,
    name: "Data Analysts",
    magic_group_type: "data-analyst",
  }),
];

const setup = async ({
  jwtEnabled,
  useTenants,
  configured,
  uriOnly,
  sharedSecretEnvConfigured,
  attributesConfigured,
  attributesEnvConfigured,
  tenantAttributeConfigured,
  groupSync,
  groupMappings,
  groupSyncEnvConfigured,
  groupMappingsEnvConfigured,
  userProvisioning,
  userProvisioningEnvConfigured,
  saveStatus,
  saveGate,
  provisioningSaveStatus,
  provisioningSaveGate,
  cascadeStatus,
  deleteGroupStatuses,
  cascadeGate,
  groupsGate,
}: {
  jwtEnabled?: boolean;
  useTenants?: boolean;
  configured?: boolean;
  // the identity provider URI is saved but the shared secret is not, so the backend does not count JWT as configured
  uriOnly?: boolean;
  sharedSecretEnvConfigured?: boolean;
  attributesConfigured?: boolean;
  attributesEnvConfigured?: boolean;
  tenantAttributeConfigured?: boolean;
  groupSync?: boolean;
  groupMappings?: Record<string, number[]>;
  groupSyncEnvConfigured?: boolean;
  groupMappingsEnvConfigured?: boolean;
  userProvisioning?: boolean;
  userProvisioningEnvConfigured?: boolean;
  saveStatus?: number;
  // a gate keeps its responses in flight until the test resolves it
  saveGate?: Promise<void>;
  provisioningSaveStatus?: number;
  provisioningSaveGate?: Promise<void>;
  cascadeStatus?: number;
  deleteGroupStatuses?: Record<number, number>;
  cascadeGate?: Promise<void>;
  groupsGate?: Promise<void>;
} = {}) => {
  const settingDefinitions: SettingDefinition[] = [
    { key: "use-tenants", value: useTenants ?? false },
    { key: "jwt-enabled", value: jwtEnabled ?? false },
    ...(userProvisioningEnvConfigured
      ? ([
          {
            key: "jwt-user-provisioning-enabled?",
            is_env_setting: true,
            env_name: "MB_JWT_USER_PROVISIONING_ENABLED",
          },
        ] as const)
      : ([
          {
            key: "jwt-user-provisioning-enabled?",
            value: userProvisioning ?? true,
          },
        ] as const)),
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
    ...(uriOnly
      ? ([
          { key: "jwt-identity-provider-uri", value: "http://example.com" },
        ] as const)
      : []),
    ...(sharedSecretEnvConfigured
      ? ([
          {
            key: "jwt-shared-secret",
            is_env_setting: true,
            env_name: "MB_JWT_SHARED_SECRET",
          },
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
    "jwt-configured": configured ?? false,
    "jwt-identity-provider-uri":
      configured || uriOnly ? "http://example.com" : null,
    "jwt-shared-secret": configured ? "590ab155f412d477b8ab9c8b0e7b" : null,
    "jwt-user-provisioning-enabled?": userProvisioning ?? true,
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
  // a failed write leaves the store alone, and a held one lands in it once the test lets it through
  const status = saveStatus ?? 204;
  fetchMock.removeRoute("update-settings");
  fetchMock.put(
    "path:/api/setting",
    async ({ options }) => {
      await saveGate;
      if (status < 300) {
        Object.assign(settingsStore, JSON.parse(String(options.body)));
        // the backend derives the flag from the two mandatory settings
        settingsStore["jwt-configured"] =
          Boolean(settingsStore["jwt-identity-provider-uri"]) &&
          Boolean(settingsStore["jwt-shared-secret"]);
      }
      return { status };
    },
    { name: "update-settings" },
  );
  if (provisioningSaveStatus != null || provisioningSaveGate != null) {
    // the single-key write behaves the same way for the provisioning switch
    const status = provisioningSaveStatus ?? 204;
    fetchMock.removeRoute("update-setting");
    fetchMock.put(
      new RegExp("/api/setting/(.+)"),
      async ({ url, options }) => {
        await provisioningSaveGate;
        if (status < 300) {
          const key = decodeURIComponent(url.split("/api/setting/")[1]);
          settingsStore[key] = JSON.parse(String(options.body)).value;
        }
        return { status };
      },
      { name: "update-setting" },
    );
  }
  setupGenerateRandomTokenEndpoint("1234abcd");

  fetchMock.get("path:/api/permissions/group", async () => {
    await groupsGate;
    return GROUPS;
  });
  fetchMock.put("express:/api/permissions/membership/:id/clear", async () => {
    await cascadeGate;
    return { status: cascadeStatus ?? 204 };
  });
  fetchMock.delete("express:/api/permissions/group/:id", async ({ url }) => {
    await cascadeGate;
    return {
      status:
        deleteGroupStatuses?.[Number(url.split("/").pop())] ??
        cascadeStatus ??
        204,
    };
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

/** Holds every settings read from now on, so a refetch stays in flight until the returned function is called */
const holdSettingsReads = (settingsStore: Record<string, unknown>) => {
  const gate = defer<void>();
  fetchMock.removeRoute("get-session-properties");
  fetchMock.get(
    "path:/api/session/properties",
    async () => {
      await gate.promise;
      return { ...settingsStore };
    },
    { name: "get-session-properties" },
  );
  return () => gate.resolve();
};

// the list holds its controls until the groups load, and a click on a held control is dropped
const clickWhenEnabled = async (element: HTMLElement) => {
  await waitFor(() => expect(element).toBeEnabled());
  await userEvent.click(element);
};

const expandUserAttributeSection = async () => {
  await userEvent.click(
    await screen.findByRole("button", { name: /User attribute configuration/ }),
  );
};

const addMapping = async (name: string, groupName: string) => {
  await clickWhenEnabled(screen.getByRole("button", { name: "New mapping" }));
  await userEvent.type(screen.getByPlaceholderText("Enter JWT group..."), name);
  await userEvent.click(screen.getByPlaceholderText("Pick Metabase group..."));
  await userEvent.click(await screen.findByRole("option", { name: groupName }));
  await userEvent.click(screen.getByRole("button", { name: "Add mapping" }));
};

const findMappingRow = (name: string) =>
  screen
    .getAllByTestId("group-mapping-row")
    .find((row) => within(row).queryByText(name) != null);

// Mantine marks a read-only option on its label, not on its input
const modeLabel = (name: string) => {
  const [label] =
    screen.getByRole<HTMLInputElement>("radio", { name }).labels ?? [];
  return label;
};

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

  it("saves the server settings, turns automatic on and enables the other cards", async () => {
    await setup();
    const attributeHeader = screen.getByRole("button", {
      name: /User attribute configuration/,
    });
    expect(attributeHeader).toBeDisabled();

    await fillServerSettings();
    await userEvent.click(
      screen.getByRole("button", { name: /Save and enable/ }),
    );

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
    await waitFor(() => expect(attributeHeader).toBeEnabled());
    expect(screen.getByRole("radio", { name: "Automatic" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Automatic" })).toBeEnabled();
    expect(
      screen.getByText(
        "At each sign-in, people are added to the Metabase groups named in their JWT and removed from all other groups, including Administrators.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Changes saved. Group mapping is set to Automatic."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Save the settings above to set up group mapping."),
    ).not.toBeInTheDocument();
  });

  it("keeps Save and enable disabled until a signing key is set up", async () => {
    await setup();
    const saveButton = screen.getByRole("button", { name: /Save and enable/ });
    // nothing has been entered yet, so the page does not complain
    expect(
      screen.queryByText("Set up a signing key before saving"),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("textbox", { name: /JWT Identity Provider URI/ }),
      ATTRS["jwt-identity-provider-uri"],
    );

    expect(
      await screen.findByText("Set up a signing key before saving"),
    ).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /Set up key/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Done/ }));

    await waitFor(() => expect(saveButton).toBeEnabled());
    expect(
      screen.queryByText("Set up a signing key before saving"),
    ).not.toBeInTheDocument();
  });

  it("saves without a key when the key comes from an env var", async () => {
    await setup({ sharedSecretEnvConfigured: true });

    await userEvent.type(
      screen.getByRole("textbox", { name: /JWT Identity Provider URI/ }),
      ATTRS["jwt-identity-provider-uri"],
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Save and enable/ }),
    );

    const [{ body }] = await findRequests("PUT");
    expect(body["jwt-identity-provider-uri"]).toBe(
      ATTRS["jwt-identity-provider-uri"],
    );
    expect(body).not.toHaveProperty("jwt-shared-secret");
    expect(
      screen.queryByText("Set up a signing key before saving"),
    ).not.toBeInTheDocument();
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
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
  });

  it("collapses the user attribute section when no attribute is set", async () => {
    await setup({ configured: true });

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
    await setup({ configured: true, tenantAttributeConfigured: true });

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

  describe("user provisioning", () => {
    it("sits at the top of the page", async () => {
      await setup();

      const cardTitles = screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent);
      expect(cardTitles).toEqual([
        "User provisioning",
        "Server settings",
        "User attribute configuration",
        "Group mapping",
      ]);
    });

    it("says that JWT sign-in also reactivates deactivated accounts", async () => {
      await setup({ configured: true });

      expect(
        screen.getByRole("switch", { name: "User provisioning" }),
      ).toHaveAccessibleDescription(/reactivate deactivated accounts/);
    });

    it("stays editable while JWT is paused but configured", async () => {
      await setup({ jwtEnabled: false, configured: true });

      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      expect(toggle).toBeEnabled();
      expect(toggle).not.toHaveAttribute("aria-disabled");
    });

    it("stays editable before the server settings are saved", async () => {
      await setup();

      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      expect(toggle).toBeEnabled();
      expect(toggle).not.toHaveAttribute("aria-disabled");
    });

    it("keeps existing mappings when the shared secret is saved later", async () => {
      await setup({
        uriOnly: true,
        groupSync: true,
        groupMappings: { devs: [3] },
      });

      await userEvent.click(
        await screen.findByRole("button", { name: /Set up key/ }),
      );
      await userEvent.clear(await screen.findByLabelText(/New secret key/));
      await userEvent.type(
        await screen.findByLabelText(/New secret key/),
        ATTRS["jwt-shared-secret"],
      );
      await userEvent.click(
        await screen.findByRole("button", { name: /Done/ }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: /Save and enable/ }),
      );

      const [{ body }] = await findRequests("PUT");
      // the setup already has mappings, so the first-save reset must leave them alone
      expect(body).not.toHaveProperty("jwt-group-mappings");
      expect(body).not.toHaveProperty("jwt-group-sync");
    });

    it("keeps group mapping off when the shared secret is saved later", async () => {
      await setup({ uriOnly: true, groupSync: false });

      await userEvent.click(
        await screen.findByRole("button", { name: /Set up key/ }),
      );
      await userEvent.clear(await screen.findByLabelText(/New secret key/));
      await userEvent.type(
        await screen.findByLabelText(/New secret key/),
        ATTRS["jwt-shared-secret"],
      );
      await userEvent.click(
        await screen.findByRole("button", { name: /Done/ }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: /Save and enable/ }),
      );

      const [{ body }] = await findRequests("PUT");
      // the URI was saved before, so this is not a first save that turns automatic mapping on
      expect(body).not.toHaveProperty("jwt-group-sync");
      expect(body).not.toHaveProperty("jwt-group-mappings");
    });

    it("stays editable while only the identity provider URI is saved", async () => {
      await setup({ uriOnly: true });

      // the missing key is what keeps the cards below locked, so the page says so on arrival
      expect(
        screen.getByText("Set up a signing key before saving"),
      ).toBeInTheDocument();

      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      expect(toggle).toBeEnabled();
      expect(toggle).not.toHaveAttribute("aria-disabled");
      // the attribute card needs the shared secret too, which is what the backend flag checks
      expect(
        screen.getByRole("button", { name: /User attribute configuration/ }),
      ).toBeDisabled();
    });

    it("saves right away without touching the page form", async () => {
      await setup({ jwtEnabled: true, configured: true });
      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      expect(toggle).toBeChecked();

      // the title is the switch's label, so clicking it toggles too
      await userEvent.click(
        screen.getByText("User provisioning", { selector: "label" }),
      );

      expect(toggle).not.toBeChecked();
      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toMatch(
        /\/api\/setting\/jwt-user-provisioning-enabled%3F$/,
      );
      expect(puts[0].body).toEqual({ value: false });
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();
    });

    it("reverts the switch and reports the error when the save fails", async () => {
      const provisioningSaveGate = defer<void>();
      await setup({
        jwtEnabled: true,
        configured: true,
        provisioningSaveStatus: 500,
        provisioningSaveGate: provisioningSaveGate.promise,
      });
      const toggle = screen.getByRole("switch", { name: "User provisioning" });

      await userEvent.click(toggle);

      try {
        // the switch flips right away and only comes back once the write fails
        expect(toggle).not.toBeChecked();
      } finally {
        provisioningSaveGate.resolve();
      }
      expect(await screen.findByText(/error saving/i)).toBeInTheDocument();
      expect(toggle).toBeChecked();
      expect(toggle).not.toHaveAttribute("aria-disabled");
    });

    it("ignores clicks while the write is in flight", async () => {
      const { settingsStore } = await setup({
        jwtEnabled: true,
        configured: true,
      });
      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      // the write answers only when the test says so, which keeps it in flight for all three clicks
      let finishWrite = () => {};
      fetchMock.removeRoute("update-setting");
      fetchMock.put(
        new RegExp("/api/setting/(.+)"),
        ({ url, options }) =>
          new Promise((resolve) => {
            finishWrite = () => {
              const key = decodeURIComponent(url.split("/api/setting/")[1]);
              settingsStore[key] = JSON.parse(String(options.body)).value;
              resolve({ status: 204 });
            };
          }),
        { name: "update-setting" },
      );

      await userEvent.click(toggle);
      await userEvent.click(toggle);
      await userEvent.click(toggle);

      expect(toggle).not.toBeChecked();
      expect(toggle).toHaveAttribute("aria-disabled", "true");
      finishWrite();
      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].body).toEqual({ value: false });
    });

    it("holds the switch until the settings refetch after the write lands", async () => {
      const { settingsStore } = await setup({
        jwtEnabled: true,
        configured: true,
      });
      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      await waitFor(() => expect(toggle).not.toHaveAttribute("aria-disabled"));
      // the refetch the write triggers stays in flight until the test lets it through
      const releaseReads = holdSettingsReads(settingsStore);

      await userEvent.click(toggle);

      try {
        expect(await screen.findByText("Changes saved")).toBeInTheDocument();
        expect(toggle).not.toBeChecked();
        expect(toggle).toHaveAttribute("aria-disabled", "true");
      } finally {
        releaseReads();
      }
      await waitFor(() => expect(toggle).not.toHaveAttribute("aria-disabled"));
      expect(toggle).not.toBeChecked();
    });

    it("locks the switch to the value set through an env var", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        userProvisioning: true,
        userProvisioningEnvConfigured: true,
      });

      // the effective value comes from the session properties, the admin list nils it
      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      expect(toggle).toHaveAttribute("aria-disabled", "true");
      expect(toggle).toBeChecked();
      expect(toggle).toHaveAccessibleDescription(
        /Using MB_JWT_USER_PROVISIONING_ENABLED/,
      );
    });
  });

  describe("group mapping", () => {
    it("keeps the attribute and group mapping cards disabled until the server settings are saved", async () => {
      await setup();

      expect(
        screen.getByRole("button", { name: /User attribute configuration/ }),
      ).toBeDisabled();
      expect(
        screen.getByRole("radiogroup", { name: "Group mapping mode" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Off" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Off" })).toBeDisabled();
      expect(
        screen.queryByText(/people are added to the Metabase groups/),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText("Save the settings above to set up group mapping."),
      ).toBeInTheDocument();
    });

    it("leaves the save hint out while an env var sets group mapping", async () => {
      await setup({ groupSyncEnvConfigured: true });

      expect(screen.getByText("Using MB_JWT_GROUP_SYNC")).toBeInTheDocument();
      expect(
        screen.queryByText("Save the settings above to set up group mapping."),
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
      const row = screen.getByTestId("group-mapping-row");
      expect(within(row).getByText("group-a")).toBeInTheDocument();
      expect(await within(row).findByText("foo")).toBeInTheDocument();
    });

    it("derives off mode when group sync is disabled", async () => {
      await setup({ jwtEnabled: true, configured: true });

      expect(screen.getByRole("radio", { name: "Off" })).toBeChecked();
    });

    it("holds the mode control until the settings refetch after the write lands", async () => {
      const { settingsStore } = await setup({
        jwtEnabled: true,
        configured: true,
      });
      const automatic = () => screen.getByRole("radio", { name: "Automatic" });
      const manual = () => screen.getByRole("radio", { name: "Manual" });
      await waitFor(() =>
        expect(modeLabel("Manual")).not.toHaveAttribute("data-read-only"),
      );
      // the refetch the write triggers stays in flight until the test lets it through
      const releaseReads = holdSettingsReads(settingsStore);

      await userEvent.click(automatic());

      try {
        expect(await screen.findByText("Changes saved")).toBeInTheDocument();
        expect(automatic()).toBeChecked();
        expect(automatic()).toBeEnabled();
        expect(automatic()).toHaveFocus();
        expect(modeLabel("Manual")).toHaveAttribute("data-read-only");
        await userEvent.click(manual());
        expect(automatic()).toBeChecked();
      } finally {
        releaseReads();
      }
      await waitFor(() =>
        expect(modeLabel("Manual")).not.toHaveAttribute("data-read-only"),
      );
      expect(automatic()).toBeChecked();
      // the click on Manual during the hold wrote nothing
      expect(await findRequests("PUT")).toHaveLength(1);
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
      expect(await screen.findAllByTestId("group-mapping-row")).toHaveLength(2);
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

      await clickWhenEnabled(
        screen.getByRole("button", { name: "Delete mapping" }),
      );
      await userEvent.click(
        await screen.findByRole("button", { name: "Remove mapping" }),
      );

      expect(await screen.findByText("Mapping deleted")).toBeInTheDocument();
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
      expect(screen.queryByTestId("group-mapping-row")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("radio", { name: "Manual" }));

      await waitFor(() => {
        expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();
      });
      expect(await screen.findByTestId("group-mapping-row")).toHaveTextContent(
        "existing",
      );
      const puts = await findRequests("PUT");
      expect(puts.map(({ body }) => body)).toEqual([
        { "jwt-group-sync": false },
        { "jwt-group-sync": true },
      ]);
    });

    it("reports a failed cascade once and skips the success toast", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { old: [4, 5], devs: [3] },
        cascadeStatus: 500,
      });

      await clickWhenEnabled(
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
      expect(screen.getAllByTestId("group-mapping-row")).toHaveLength(1);
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

      await clickWhenEnabled(
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

    it("keeps Enter on the mode control from submitting the page form", async () => {
      await setup({ configured: true });
      await userEvent.type(
        screen.getByRole("textbox", { name: /JWT Identity Provider URI/ }),
        "/sso",
      );
      const saveButton = screen.getByRole("button", {
        name: "Save and enable",
      });
      expect(saveButton).toBeEnabled();

      act(() => screen.getByRole("radio", { name: "Off" }).focus());
      await userEvent.keyboard("{Enter}");

      expect(await findRequests("PUT")).toHaveLength(0);
      expect(saveButton).toBeEnabled();
    });

    it("still switches the mode with the other keys", async () => {
      await setup({ jwtEnabled: true, configured: true, groupSync: true });
      const offRadio = screen.getByRole("radio", { name: "Off" });

      act(() => offRadio.focus());
      await userEvent.keyboard(" ");

      await waitFor(() => expect(offRadio).toBeChecked());
      const [{ body }] = await findRequests("PUT");
      expect(body).toEqual({ "jwt-group-sync": false });
    });

    it("keeps an open draft when the switch to automatic is cancelled", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { devs: [3] },
      });

      await clickWhenEnabled(
        within(findMappingRow("devs")!).getByRole("button", {
          name: "Edit mapping",
        }),
      );
      await userEvent.type(
        screen.getByPlaceholderText("Enter JWT group..."),
        "-team",
      );
      await userEvent.click(screen.getByRole("radio", { name: "Automatic" }));
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Cancel",
        }),
      );

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();
      expect(screen.getByPlaceholderText("Enter JWT group...")).toHaveValue(
        "devs-team",
      );
    });

    it("keeps an open draft when turning group mapping off fails", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { existing: [3] },
        saveStatus: 500,
      });

      await clickWhenEnabled(
        screen.getByRole("button", { name: "New mapping" }),
      );
      await userEvent.type(
        screen.getByPlaceholderText("Enter JWT group..."),
        "devs",
      );
      await userEvent.click(screen.getByRole("radio", { name: "Off" }));

      expect(
        await screen.findByText("Error saving group mapping"),
      ).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();
      expect(screen.getByPlaceholderText("Enter JWT group...")).toHaveValue(
        "devs",
      );
    });

    it("hides the new mapping button while a draft is open", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { devs: [3] },
      });
      const newButton = () =>
        screen.queryByRole("button", { name: "New mapping" });

      await clickWhenEnabled(
        within(findMappingRow("devs")!).getByRole("button", {
          name: "Edit mapping",
        }),
      );
      expect(newButton()).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(newButton()).toBeInTheDocument();
    });

    it("holds the mapping rows while a save is in flight", async () => {
      const saveGate = defer<void>();
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { existing: [3] },
        saveGate: saveGate.promise,
      });
      const deleteButton = within(findMappingRow("existing")!).getByRole(
        "button",
        { name: "Delete mapping" },
      );

      await addMapping("devs", "bar");

      try {
        expect(deleteButton).toBeDisabled();
      } finally {
        saveGate.resolve();
      }
      expect(await screen.findByText("Mapping added")).toBeInTheDocument();
      await waitFor(() => expect(deleteButton).toBeEnabled());
    });

    it("holds the mapping controls until the groups have loaded", async () => {
      const groupsGate = defer<void>();
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { devs: [3] },
        groupsGate: groupsGate.promise,
      });
      const newButton = () =>
        screen.getByRole("button", { name: "New mapping" });
      const deleteButton = () =>
        within(findMappingRow("devs")!).getByRole("button", {
          name: "Delete mapping",
        });

      try {
        expect(newButton()).toBeDisabled();
        expect(deleteButton()).toBeDisabled();
        // the mode control writes settings, not group ids, so it does not wait for the groups
        expect(screen.getByRole("radio", { name: "Off" })).toBeEnabled();
        await waitFor(() =>
          expect(modeLabel("Off")).not.toHaveAttribute("data-read-only"),
        );
        expect(newButton()).toBeDisabled();
      } finally {
        groupsGate.resolve();
      }
      await waitFor(() => expect(newButton()).toBeEnabled());
      expect(deleteButton()).toBeEnabled();
    });

    it("holds the controls until the cascade finishes", async () => {
      const cascadeGate = defer<void>();
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { old: [4], devs: [3] },
        cascadeGate: cascadeGate.promise,
      });

      await clickWhenEnabled(
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

      try {
        // the mapping write is done once the row is gone, while the group delete is still in flight
        await waitFor(() => expect(findMappingRow("old")).toBeUndefined());
        expect(
          within(findMappingRow("devs")!).getByRole("button", {
            name: "Delete mapping",
          }),
        ).toBeDisabled();
        expect(screen.getByRole("radio", { name: "Off" })).toBeEnabled();
        expect(modeLabel("Off")).toHaveAttribute("data-read-only");
      } finally {
        cascadeGate.resolve();
      }
      expect(await screen.findByText("Mapping deleted")).toBeInTheDocument();
      await waitFor(() =>
        expect(
          within(findMappingRow("devs")!).getByRole("button", {
            name: "Delete mapping",
          }),
        ).toBeEnabled(),
      );
      expect(modeLabel("Off")).not.toHaveAttribute("data-read-only");
    });

    it("deletes a mapping's groups and drops them from the other mappings once they are gone", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { old: [4], devs: [4, 3] },
      });

      await clickWhenEnabled(
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
      const settingsPuts = puts.filter(({ url }) =>
        /\/api\/setting$/.test(url),
      );
      expect(settingsPuts.map(({ body }) => body)).toEqual([
        { "jwt-group-mappings": { devs: [4, 3] } },
        { "jwt-group-mappings": { devs: [3] } },
      ]);
      const deletes = await findRequests("DELETE");
      expect(deletes.map(({ url }) => url)).toEqual([
        "http://localhost/api/permissions/group/4",
      ]);
    });

    it("keeps a group in the other mappings when its deletion is refused", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { old: [4, 3], devs: [3] },
        deleteGroupStatuses: { 3: 400 },
      });

      await clickWhenEnabled(
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
        await screen.findByText(
          "Mapping deleted, but not all of its groups could be updated",
        ),
      ).toBeInTheDocument();
      const puts = await findRequests("PUT");
      const settingsPuts = puts.filter(({ url }) =>
        /\/api\/setting$/.test(url),
      );
      expect(settingsPuts.map(({ body }) => body)).toEqual([
        { "jwt-group-mappings": { devs: [3] } },
      ]);
      expect(findMappingRow("devs")).toHaveTextContent("foo");
    });

    it("never asks the backend to delete a built-in group", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { old: [4, 6], devs: [3] },
      });

      await clickWhenEnabled(
        within(findMappingRow("old")!).getByRole("button", {
          name: "Delete mapping",
        }),
      );
      expect(
        await screen.findByText(/The Data Analysts group is not affected/),
      ).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("radio", { name: /Also delete the groups/ }),
      );
      await userEvent.click(
        screen.getByRole("button", {
          name: "Remove mapping and delete groups",
        }),
      );

      expect(await screen.findByText("Mapping deleted")).toBeInTheDocument();
      const deletes = await findRequests("DELETE");
      expect(deletes.map(({ url }) => url)).toEqual([
        "http://localhost/api/permissions/group/4",
      ]);
    });

    it("edits a mapping without the ids of groups that no longer exist", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { devs: [9, 3] },
      });

      await clickWhenEnabled(
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

      await clickWhenEnabled(
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

      expect(await screen.findByText("Mapping deleted")).toBeInTheDocument();
      const [{ body }] = await findRequests("PUT");
      expect(body).toEqual({
        "jwt-group-mappings": {},
        "jwt-group-sync": false,
      });
      await waitFor(() => {
        expect(screen.getByRole("radio", { name: "Off" })).toBeChecked();
      });
    });

    it("allows mapping names that collide with object prototype members", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { existing: [3] },
      });

      await clickWhenEnabled(
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

      expect(await screen.findAllByTestId("group-mapping-row")).toHaveLength(2);
    });

    it("cancels the row editor on Escape", async () => {
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { existing: [3] },
      });

      await clickWhenEnabled(
        screen.getByRole("button", { name: "New mapping" }),
      );
      await userEvent.type(
        screen.getByPlaceholderText("Enter JWT group..."),
        "temp{Escape}",
      );

      expect(
        screen.queryByPlaceholderText("Enter JWT group..."),
      ).not.toBeInTheDocument();
      expect(screen.getAllByTestId("group-mapping-row")).toHaveLength(1);
      expect(await findRequests("PUT")).toHaveLength(0);
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
      expect(
        screen.getByText(
          "Your existing group mappings will be deleted. From then on, at each sign-in, people are added to the Metabase groups named in their JWT and removed from all other groups, including Administrators.",
        ),
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
      expect(screen.queryByTestId("group-mapping-row")).not.toBeInTheDocument();
    });

    it("keeps the confirmation busy until the automatic switch is saved", async () => {
      const saveGate = defer<void>();
      await setup({
        jwtEnabled: true,
        configured: true,
        groupSync: true,
        groupMappings: { "group-a": [3] },
        saveGate: saveGate.promise,
      });

      await userEvent.click(screen.getByRole("radio", { name: "Automatic" }));
      const confirmButton = await screen.findByRole("button", {
        name: "Delete mappings and switch",
      });
      await userEvent.dblClick(confirmButton);

      try {
        expect(confirmButton).toBeDisabled();
        expect(
          screen.getByText("Switch to automatic group mapping?"),
        ).toBeInTheDocument();
      } finally {
        saveGate.resolve();
      }
      await waitFor(() =>
        expect(
          screen.queryByText("Switch to automatic group mapping?"),
        ).not.toBeInTheDocument(),
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
      expect(screen.getByTestId("group-mapping-row")).toHaveTextContent(
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
      expect(screen.getByTestId("group-mapping-row")).toHaveTextContent(
        "stored-group",
      );
      expect(
        screen.queryByRole("button", { name: "Edit mapping" }),
      ).not.toBeInTheDocument();
    });

    it("does not turn sync on with the first save when it is env-configured", async () => {
      await setup({ groupSyncEnvConfigured: true });

      await fillServerSettings();
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
