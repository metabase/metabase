import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupSettingsEndpoints,
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
import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
  SettingDefinition,
} from "metabase-types/api";
import { createMockGroup, createMockSettings } from "metabase-types/api/mocks";

import { GROUP_SYNC_WRITE_DEBOUNCE_MS } from "./LdapGroupMappingSection";
import { SettingsLdapForm } from "./SettingsLdapForm";

const GROUPS = [
  createMockGroup(),
  createMockGroup({ id: 2, name: "Administrators", magic_group_type: "admin" }),
  createMockGroup({ id: 3, name: "foo", magic_group_type: null }),
  createMockGroup({ id: 4, name: "bar", magic_group_type: null }),
  createMockGroup({ id: 5, name: "flamingos", magic_group_type: null }),
];

const DEFAULT_USER_FILTER =
  "(&(objectClass=inetOrgPerson)(|(uid={login})(mail={login})))";

// the admin list carries the backend defaults, which the page shows as placeholders
const DEFAULT_DEFINITIONS: SettingDefinition[] = [
  { key: "ldap-user-filter", default: DEFAULT_USER_FILTER },
  { key: "ldap-attribute-email", default: "mail" },
  { key: "ldap-attribute-firstname", default: "givenName" },
  { key: "ldap-attribute-lastname", default: "sn" },
];

const DEVS_DN = "cn=devs,ou=groups,dc=example,dc=org";
const OPS_DN = "cn=ops,ou=groups,dc=example,dc=org";
const RENAMED_DN = "cn=developers,ou=groups,dc=example,dc=org";
const LDAP_GROUP_PLACEHOLDER = "cn=people,ou=groups,dc=example,dc=org";

// the admin list only carries values that were set, so the test values stand in for those
const toDefinitions = (
  values: Partial<EnterpriseSettings>,
): SettingDefinition[] =>
  // Object.keys widens the keys of a typed record to string
  (Object.keys(values) as EnterpriseSettingKey[]).map((key) => ({
    key,
    value: values[key],
  }));

const setup = async ({
  settingValues = {},
  settingDefinitions = [],
  saveStatus,
  saveMessage,
}: {
  settingValues?: Partial<EnterpriseSettings>;
  // entries here win over the ones derived from settingValues
  settingDefinitions?: SettingDefinition[];
  saveStatus?: number;
  saveMessage?: string;
} = {}) => {
  const settings = createMockSettings(settingValues);
  delete settings["ldap-group-membership-filter"]; // not present in OSS
  const listedKeys = new Set(
    settingDefinitions.map((definition) => definition.key),
  );
  setupSettingsEndpoints([
    ...settingDefinitions,
    ...toDefinitions(settingValues).filter(({ key }) => !listedKeys.has(key)),
  ]);
  // the switch and the mappings read their values back after saving, so the properties mock has to remember writes
  setupStatefulSettingsEndpoints(settings);
  if (saveStatus != null) {
    // a rejected write comes back as a plain-text reason, the way the settings endpoint reports a 400
    fetchMock.removeRoute("update-settings");
    fetchMock.put(
      "path:/api/setting",
      {
        status: saveStatus,
        body: saveMessage,
        headers: { "content-type": "text/plain" },
      },
      { name: "update-settings" },
    );
  }
  fetchMock.get("path:/api/permissions/group", GROUPS);
  fetchMock.put("express:/api/permissions/membership/:id/clear", 204);
  fetchMock.delete("express:/api/permissions/group/:id", 204);
  fetchMock.put("path:/api/ldap/settings", { status: 204 });

  const { store } = renderWithProviders(<SettingsLdapForm />, {
    withUndos: true,
    storeInitialState: createMockState({
      settings: createMockSettingsState(settings),
    }),
  });

  await screen.findByText("Server settings");
  return { store };
};

const expandAttributes = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Attributes" }));
};

const groupMappingSwitch = () =>
  screen.getByRole("switch", { name: "Group mapping" });

const findMappingRow = (name: string) =>
  screen
    .queryAllByTestId("group-mapping-row")
    .find((row) => within(row).queryByText(name) != null);

const addMapping = async (name: string, groupName: string) => {
  await userEvent.click(screen.getByRole("button", { name: "New" }));
  await userEvent.type(
    screen.getByPlaceholderText(LDAP_GROUP_PLACEHOLDER),
    name,
  );
  await userEvent.click(screen.getByPlaceholderText("Pick Metabase group..."));
  await userEvent.click(await screen.findByRole("option", { name: groupName }));
  await userEvent.click(screen.getByRole("button", { name: "Add mapping" }));
};

describe("SettingsLdapForm", () => {
  const ATTRS = {
    "ldap-host": "example.com",
    "ldap-port": 123,
    "ldap-security": "ssl",
    "ldap-user-base": "user-base",
    "ldap-user-filter": "(filter1)",
    "ldap-bind-dn": "username",
    "ldap-password": "password",
    "ldap-attribute-email": "john@example.com",
    "ldap-attribute-firstname": "John",
    "ldap-attribute-lastname": "Doe",
    "ldap-enabled": true,
    "ldap-group-base": "group-base",
  } satisfies Partial<EnterpriseSettings>;

  it("should submit the correct payload", async () => {
    // the group fields only show while group mapping is on
    await setup({ settingValues: { "ldap-group-sync": true } });

    await userEvent.type(
      await screen.findByLabelText(/LDAP host/),
      ATTRS["ldap-host"],
    );

    const portInput = await screen.findByLabelText(/LDAP port/);
    await userEvent.clear(portInput);
    await userEvent.type(portInput, ATTRS["ldap-port"].toString());
    await userEvent.click(screen.getByRole("radio", { name: /SSL/ }));
    await userEvent.type(
      await screen.findByLabelText(/Username or DN/),
      ATTRS["ldap-bind-dn"],
    );
    await userEvent.type(
      screen.getByLabelText(/Password/),
      ATTRS["ldap-password"],
    );
    await userEvent.type(
      await screen.findByLabelText(/User search base/),
      ATTRS["ldap-user-base"],
    );
    await userEvent.type(
      await screen.findByLabelText(/User filter/),
      ATTRS["ldap-user-filter"],
    );
    await expandAttributes();
    await userEvent.type(
      await screen.findByLabelText(/Email attribute key/),
      ATTRS["ldap-attribute-email"],
    );
    await userEvent.type(
      await screen.findByLabelText(/First name attribute key/),
      ATTRS["ldap-attribute-firstname"],
    );
    await userEvent.type(
      await screen.findByLabelText(/Last name attribute key/),
      ATTRS["ldap-attribute-lastname"],
    );
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Group search base/ }),
      ATTRS["ldap-group-base"],
    );

    await userEvent.click(await screen.findByRole("button", { name: /Save/ }));

    const [{ url, body }] = await findRequests("PUT");

    expect(url).toMatch(/api\/ldap\/settings/);
    expect(body).toEqual(ATTRS);
  });

  it("should hide the group membership filter on OSS", async () => {
    await setup({ settingValues: { "ldap-group-sync": true } });

    expect(
      screen.getByRole("textbox", { name: /Group search base/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /Group membership filter/ }),
    ).not.toBeInTheDocument();
  });

  it("can remove a nullable field", async () => {
    await setup({ settingValues: ATTRS });

    await userEvent.clear(
      await screen.findByLabelText(/First name attribute key/),
    );
    await userEvent.click(await screen.findByRole("button", { name: /Save/ }));

    const [{ body }] = await findRequests("PUT");

    // if the field is omitted, this will be undefined instead of null
    expect(body["ldap-attribute-firstname"]).toBe(null);
    expect(body["ldap-attribute-lastname"]).toBe(
      ATTRS["ldap-attribute-lastname"],
    );
  });

  it("does not offer user provisioning on OSS", async () => {
    await setup();

    expect(screen.queryByText("User provisioning")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: "User provisioning" }),
    ).not.toBeInTheDocument();
  });

  it("lays the cards out in the designed order", async () => {
    await setup();

    const cardTitles = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(cardTitles).toEqual([
      "Server settings",
      "User schema",
      "Attributes",
      "Group mapping",
    ]);
  });

  describe("defaults", () => {
    it("shows the defaults as placeholders and leaves unset fields empty", async () => {
      await setup({ settingDefinitions: DEFAULT_DEFINITIONS });

      const userFilter = screen.getByLabelText(/User filter/);
      expect(userFilter).toHaveValue("");
      expect(userFilter).toHaveAttribute("placeholder", DEFAULT_USER_FILTER);
      // the connection test needs a port, so the one in effect is filled in
      expect(screen.getByLabelText(/LDAP port/)).toHaveValue(389);

      await expandAttributes();

      expect(screen.getByLabelText(/Email attribute key/)).toHaveValue("");
      expect(screen.getByLabelText(/Email attribute key/)).toHaveAttribute(
        "placeholder",
        "mail",
      );
      expect(screen.getByLabelText(/First name attribute key/)).toHaveAttribute(
        "placeholder",
        "givenName",
      );
      expect(screen.getByLabelText(/Last name attribute key/)).toHaveAttribute(
        "placeholder",
        "sn",
      );
    });

    it("shows the value an env var gives a field, read-only", async () => {
      await setup({
        settingValues: { "ldap-host": "ldap.env.test" },
        settingDefinitions: [
          { key: "ldap-host", is_env_setting: true, env_name: "MB_LDAP_HOST" },
        ],
      });

      const hostInput = screen.getByLabelText(/LDAP host/);
      expect(hostInput).toHaveValue("ldap.env.test");
      expect(hostInput).toHaveAttribute("readonly");
      expect(screen.getByText("Using MB_LDAP_HOST")).toBeInTheDocument();
    });

    it("keeps the attributes card collapsed until an attribute is customized", async () => {
      await setup({ settingDefinitions: DEFAULT_DEFINITIONS });

      expect(
        screen.getByRole("button", { name: "Attributes" }),
      ).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByLabelText(/Email attribute key/)).not.toBeVisible();
    });

    it("opens the attributes card when an attribute is set", async () => {
      await setup({ settingValues: { "ldap-attribute-email": "uid" } });

      expect(
        screen.getByRole("button", { name: "Attributes" }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByLabelText(/Email attribute key/)).toHaveValue("uid");
    });

    it("opens the attributes card when an attribute comes from an env var", async () => {
      await setup({
        settingDefinitions: [
          {
            key: "ldap-attribute-lastname",
            is_env_setting: true,
            env_name: "MB_LDAP_ATTRIBUTE_LASTNAME",
          },
        ],
      });

      expect(
        screen.getByRole("button", { name: "Attributes" }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(
        screen.getByText("Using MB_LDAP_ATTRIBUTE_LASTNAME"),
      ).toBeInTheDocument();
    });
  });

  describe("group mapping", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it("keeps the mappings and the group fields hidden while group mapping is off", async () => {
      await setup();

      expect(groupMappingSwitch()).not.toBeChecked();
      expect(
        screen.queryByText("Manual group mappings"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("textbox", { name: /Group search base/ }),
      ).not.toBeInTheDocument();
    });

    it("turns group mapping on right away and reveals the mappings and the group fields", async () => {
      await setup();

      await userEvent.click(groupMappingSwitch());

      expect(groupMappingSwitch()).toBeChecked();
      expect(screen.getByText("Manual group mappings")).toBeInTheDocument();
      expect(screen.getByText("No mappings yet")).toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: /Group search base/ }),
      ).toBeInTheDocument();
      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toMatch(/\/api\/setting\/ldap-group-sync$/);
      expect(puts[0].body).toEqual({ value: true });
      expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
    });

    it("keeps the switch on while a refetch that started before its write lands", async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { store } = await setup();

      await user.click(groupMappingSwitch());
      expect(groupMappingSwitch()).toBeChecked();

      // a save elsewhere on the page refetches the settings before the debounced write goes out
      act(() => {
        store.dispatch(settingsApi.util.invalidateTags(["session-properties"]));
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(50);
      });
      expect(await findRequests("PUT")).toHaveLength(0);
      expect(groupMappingSwitch()).toBeChecked();
      expect(screen.getByText("Manual group mappings")).toBeInTheDocument();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(GROUP_SYNC_WRITE_DEBOUNCE_MS + 50);
      });
      expect(await findRequests("PUT")).toHaveLength(1);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(50);
      });
      expect(groupMappingSwitch()).toBeChecked();
      expect(screen.getByText("Manual group mappings")).toBeInTheDocument();
    });

    it("adds a mapping and writes it without touching the page form", async () => {
      await setup({ settingValues: { "ldap-group-sync": true } });

      await userEvent.click(screen.getByRole("button", { name: "New" }));
      expect(
        screen.queryByRole("button", { name: "New" }),
      ).not.toBeInTheDocument();
      await userEvent.type(
        screen.getByPlaceholderText(LDAP_GROUP_PLACEHOLDER),
        DEVS_DN,
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
        "ldap-group-mappings": { [DEVS_DN]: [4] },
      });
      const row = findMappingRow(DEVS_DN);
      expect(row).toBeDefined();
      expect(within(row!).getByText("bar")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
    });

    it("keeps group mapping on when the last mapping is deleted", async () => {
      await setup({
        settingValues: {
          "ldap-group-sync": true,
          "ldap-group-mappings": { [DEVS_DN]: [3] },
        },
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Delete mapping" }),
      );
      const modal = await screen.findByRole("dialog");
      expect(
        within(modal).queryByText(/group mapping will be turned off/),
      ).not.toBeInTheDocument();
      await userEvent.click(
        within(modal).getByRole("button", { name: "Remove mapping" }),
      );

      expect(await screen.findByText("Mapping deleted")).toBeInTheDocument();
      const [{ body }] = await findRequests("PUT");
      expect(body).toEqual({ "ldap-group-mappings": {} });
      expect(groupMappingSwitch()).toBeChecked();
      expect(screen.getByText("No mappings yet")).toBeInTheDocument();
      expect(findMappingRow(DEVS_DN)).toBeUndefined();
    });

    it("locks the mappings to the ones an env var sets", async () => {
      await setup({
        settingValues: {
          "ldap-group-sync": true,
          "ldap-group-mappings": { [DEVS_DN]: [3] },
        },
        settingDefinitions: [
          {
            key: "ldap-group-mappings",
            is_env_setting: true,
            env_name: "MB_LDAP_GROUP_MAPPINGS",
          },
        ],
      });

      expect(
        screen.getByText("Using MB_LDAP_GROUP_MAPPINGS"),
      ).toBeInTheDocument();
      const row = findMappingRow(DEVS_DN);
      expect(row).toBeDefined();
      expect(await within(row!).findByText("foo")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "New" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Edit mapping" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Delete mapping" }),
      ).not.toBeInTheDocument();
    });

    it("locks the switch to the value an env var sets", async () => {
      await setup({
        settingValues: { "ldap-group-sync": true },
        settingDefinitions: [
          {
            key: "ldap-group-sync",
            is_env_setting: true,
            env_name: "MB_LDAP_GROUP_SYNC",
          },
        ],
      });

      expect(groupMappingSwitch()).toBeChecked();
      expect(groupMappingSwitch()).toBeDisabled();
      expect(groupMappingSwitch()).toHaveAccessibleDescription(
        /Using MB_LDAP_GROUP_SYNC/,
      );
      expect(screen.getByText("Manual group mappings")).toBeInTheDocument();
    });

    it("keeps the editor open and shows the backend's reason under the name", async () => {
      const reason = `qwf is not a valid DN. Example: ${LDAP_GROUP_PLACEHOLDER}`;
      await setup({
        settingValues: { "ldap-group-sync": true },
        saveStatus: 400,
        saveMessage: reason,
      });

      await addMapping("qwf", "bar");

      const nameInput = screen.getByPlaceholderText(LDAP_GROUP_PLACEHOLDER);
      expect(await screen.findByText(reason)).toBeInTheDocument();
      // the reason sits under the field, not in a toast as well
      expect(screen.getAllByText(reason)).toHaveLength(1);
      expect(nameInput).toBeInvalid();
      expect(nameInput).toHaveAccessibleDescription(reason);
      expect(screen.getByRole("alert")).toHaveTextContent(reason);
      expect(nameInput).toHaveValue("qwf");
      expect(screen.getByRole("button", { name: "Add mapping" })).toBeEnabled();
      expect(screen.queryByTestId("group-mapping-row")).not.toBeInTheDocument();
      expect(screen.queryByText("Mapping added")).not.toBeInTheDocument();

      // fixing the name clears the reason and lets the mapping through
      await userEvent.clear(nameInput);
      expect(screen.queryByText(reason)).not.toBeInTheDocument();
      expect(nameInput).not.toBeInvalid();
    });

    it("adds the mapping on Enter without submitting the page form", async () => {
      await setup({ settingValues: { "ldap-group-sync": true } });

      // a dirty page form has a live Save button, so Enter could submit it
      await userEvent.type(screen.getByLabelText(/LDAP host/), "ldap.test");
      expect(screen.getByRole("button", { name: /Save/ })).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "New" }));
      const nameInput = screen.getByPlaceholderText(LDAP_GROUP_PLACEHOLDER);
      await userEvent.type(nameInput, DEVS_DN);
      await userEvent.click(
        screen.getByPlaceholderText("Pick Metabase group..."),
      );
      await userEvent.click(await screen.findByRole("option", { name: "bar" }));
      await userEvent.click(nameInput);
      await userEvent.keyboard("{Enter}");

      await waitFor(() => {
        expect(findMappingRow(DEVS_DN)).toBeDefined();
      });
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toMatch(/\/api\/setting$/);
    });

    it("edits an existing mapping in place", async () => {
      await setup({
        settingValues: {
          "ldap-group-sync": true,
          "ldap-group-mappings": { [DEVS_DN]: [3], [OPS_DN]: [4] },
        },
      });

      await userEvent.click(
        within(findMappingRow(DEVS_DN)!).getByRole("button", {
          name: "Edit mapping",
        }),
      );
      const nameInput = screen.getByLabelText("LDAP group name");
      expect(nameInput).toHaveValue(DEVS_DN);
      expect(screen.getByText("foo")).toBeInTheDocument();
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, RENAMED_DN);
      await userEvent.click(screen.getByLabelText("Metabase groups"));
      await userEvent.click(await screen.findByRole("option", { name: "bar" }));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("Mapping updated")).toBeInTheDocument();
      const [{ body }] = await findRequests("PUT");
      // the renamed mapping keeps its place in the list
      expect(body).toEqual({
        "ldap-group-mappings": { [RENAMED_DN]: [3, 4], [OPS_DN]: [4] },
      });
      const names = screen
        .getAllByTestId("group-mapping-row")
        .map((row) => within(row).getAllByText(/./)[0].textContent);
      expect(names).toEqual([RENAMED_DN, OPS_DN]);
    });

    it("deletes a mapping and clears its groups after the mapping is gone", async () => {
      await setup({
        settingValues: {
          "ldap-group-sync": true,
          "ldap-group-mappings": { [DEVS_DN]: [4], [OPS_DN]: [3] },
        },
      });

      await userEvent.click(
        within(findMappingRow(DEVS_DN)!).getByRole("button", {
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
      const mappingsWrite = puts.findIndex(({ url }) =>
        /\/api\/setting$/.test(url),
      );
      const clearWrite = puts.findIndex(({ url }) =>
        url.includes("/api/permissions/membership/4/clear"),
      );
      expect(puts[mappingsWrite].body).toEqual({
        "ldap-group-mappings": { [OPS_DN]: [3] },
      });
      expect(clearWrite).toBeGreaterThan(mappingsWrite);
      expect(
        puts.some(({ url }) =>
          url.includes("/api/permissions/membership/3/clear"),
        ),
      ).toBe(false);
      await waitFor(() => expect(findMappingRow(DEVS_DN)).toBeUndefined());
    });
  });
});
