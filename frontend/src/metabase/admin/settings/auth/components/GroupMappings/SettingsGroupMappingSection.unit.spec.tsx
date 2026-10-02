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
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import { settingsApi } from "metabase/settings";
import { defer } from "metabase/utils/promise";
import { checkNotNull } from "metabase/utils/types";
import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
  SettingDefinition,
} from "metabase-types/api";
import { createMockGroup, createMockSettings } from "metabase-types/api/mocks";

import { SettingsGroupMappingSection } from "./SettingsGroupMappingSection";

const GROUPS = [
  createMockGroup(),
  createMockGroup({ id: 2, name: "Administrators", magic_group_type: "admin" }),
  createMockGroup({ id: 3, name: "Engineering", magic_group_type: null }),
  createMockGroup({ id: 4, name: "Marketing", magic_group_type: null }),
];

const DEVS_DN = "cn=devs,ou=groups,dc=example,dc=org";
const OPS_DN = "cn=ops,ou=groups,dc=example,dc=org";

const toDefinitions = (
  values: Partial<EnterpriseSettings>,
): SettingDefinition[] =>
  // Object.keys widens the keys of a typed record to string
  (Object.keys(values) as EnterpriseSettingKey[]).map((key) => ({
    key,
    value: values[key],
  }));

const groupMappingSwitch = () =>
  screen.getByRole("switch", { name: "Group mapping" });

const findMappingRow = (name: string) =>
  screen
    .queryAllByTestId("group-mapping-row")
    .find((row) => within(row).queryByText(name) != null);

const getMappingRow = (name: string) => checkNotNull(findMappingRow(name));

const clickWhenEnabled = async (element: HTMLElement) => {
  await waitFor(() => expect(element).toBeEnabled());
  await userEvent.click(element);
};

const getRowButton = (mappingName: string, buttonName: string) =>
  within(getMappingRow(mappingName)).getByRole("button", { name: buttonName });

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

const fillNewDraft = async (name: string) => {
  await clickWhenEnabled(screen.getByRole("button", { name: "New" }));
  await userEvent.type(screen.getByLabelText("LDAP group name"), name);
  await userEvent.click(screen.getByPlaceholderText("Pick Metabase group..."));
  await userEvent.click(
    await screen.findByRole("option", { name: "Engineering" }),
  );
};

const setup = async ({
  settingValues = {},
  settingDefinitions = [],
  updateDelay,
  readDelay,
  groupsDelay,
  groupsStatus,
  withRouter = false,
  disabled = false,
}: {
  settingValues?: Partial<EnterpriseSettings>;
  settingDefinitions?: SettingDefinition[];
  updateDelay?: number;
  readDelay?: number;
  groupsDelay?: number;
  groupsStatus?: number;
  withRouter?: boolean;
  disabled?: boolean;
} = {}) => {
  const settings = createMockSettings(settingValues);
  const listedKeys = new Set(
    settingDefinitions.map((definition) => definition.key),
  );
  setupSettingsEndpoints([
    ...settingDefinitions,
    ...toDefinitions(settingValues).filter(({ key }) => !listedKeys.has(key)),
  ]);
  const settingsStore = setupStatefulSettingsEndpoints(settings, {
    updateDelay,
    readDelay,
  });
  fetchMock.get(
    "path:/api/permissions/group",
    groupsStatus == null ? GROUPS : { status: groupsStatus },
    { delay: groupsDelay },
  );

  const onToggle = jest.fn();
  const section = (
    <SettingsGroupMappingSection
      syncSettingKey="ldap-group-sync"
      mappingsSettingKey="ldap-group-mappings"
      description="Assign people to groups based on their LDAP groups"
      nameLabel="LDAP group name"
      namePlaceholder="cn=people,ou=groups,dc=example,dc=org"
      disabled={disabled}
      onToggle={onToggle}
    >
      <div>Group fields</div>
    </SettingsGroupMappingSection>
  );
  let tree = section;
  if (withRouter) {
    tree = (
      <Route path="/">
        <Route path="ldap" element={section} />
        <Route path="people" element={<span>People</span>} />
      </Route>
    );
  }
  const { store, router } = renderWithProviders(tree, {
    withUndos: true,
    withRouter,
    initialRoute: "/ldap",
    storeInitialState: createMockState({
      settings: createMockSettingsState(settings),
    }),
  });

  if (settingValues["ldap-group-sync"] === true) {
    await screen.findByText("Manual group mappings");
  } else {
    await waitFor(() =>
      expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled"),
    );
  }
  return { store, settingsStore, router, onToggle };
};

describe("SettingsGroupMappingSection", () => {
  it("shows the new value and holds the switch while the write is in flight", async () => {
    const { onToggle } = await setup({ updateDelay: 200 });

    await userEvent.click(groupMappingSwitch());

    expect(groupMappingSwitch()).toBeChecked();
    expect(groupMappingSwitch()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Manual group mappings")).toBeInTheDocument();
    await waitFor(() =>
      expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled"),
    );
    expect(groupMappingSwitch()).toBeChecked();
    expect(await findRequests("PUT")).toHaveLength(1);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("holds the switch until the settings refetch after the write lands", async () => {
    await setup({ readDelay: 200 });

    await userEvent.click(groupMappingSwitch());
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();

    expect(groupMappingSwitch()).toBeChecked();
    expect(groupMappingSwitch()).toHaveAttribute("aria-disabled", "true");
    await waitFor(() =>
      expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled"),
    );
    expect(groupMappingSwitch()).toBeChecked();
  });

  it("says how to unlock the card", async () => {
    await setup({ disabled: true });

    expect(groupMappingSwitch()).toBeDisabled();
    expect(groupMappingSwitch()).toHaveAccessibleDescription(
      /Save the settings above to set up group mapping/,
    );
  });

  it("says nothing about saving once the card is unlocked", async () => {
    await setup();

    expect(groupMappingSwitch()).not.toHaveAccessibleDescription(
      /Save the settings above to set up group mapping/,
    );
  });

  it("puts the old value back when the write fails", async () => {
    const { onToggle } = await setup();
    fetchMock.removeRoute("update-setting");
    fetchMock.put(new RegExp("/api/setting/(.+)"), 500, {
      name: "update-setting",
    });

    await userEvent.click(groupMappingSwitch());

    expect(await screen.findByText(/Error saving/)).toBeInTheDocument();
    expect(groupMappingSwitch()).not.toBeChecked();
    await waitFor(() =>
      expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled"),
    );
    expect(screen.queryByText("Manual group mappings")).not.toBeInTheDocument();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("keeps group mapping on when the last mapping is deleted", async () => {
    await setup({
      settingValues: {
        "ldap-group-sync": true,
        "ldap-group-mappings": { [DEVS_DN]: [3] },
      },
    });

    await clickWhenEnabled(getRowButton(DEVS_DN, "Delete mapping"));
    const modal = await screen.findByRole("dialog");
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

  it("holds the mappings while the settings refetch after a write", async () => {
    const { settingsStore } = await setup({
      settingValues: {
        "ldap-group-sync": true,
        "ldap-group-mappings": { [DEVS_DN]: [3], [OPS_DN]: [3] },
      },
    });
    const newButton = () => screen.getByRole("button", { name: "New" });
    const deleteButton = () => getRowButton(DEVS_DN, "Delete mapping");
    await waitFor(() => expect(deleteButton()).toBeEnabled());
    const releaseReads = holdSettingsReads(settingsStore);

    await userEvent.click(deleteButton());
    const modal = await screen.findByRole("dialog");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Remove mapping" }),
    );

    try {
      expect(await screen.findByText("Mapping deleted")).toBeInTheDocument();
      expect(newButton()).toBeDisabled();
    } finally {
      releaseReads();
    }
    await waitFor(() => expect(newButton()).toBeEnabled());
    expect(findMappingRow(DEVS_DN)).toBeUndefined();
  });

  it("carries on as a new mapping when the one being edited disappears", async () => {
    const { store, settingsStore } = await setup({
      settingValues: {
        "ldap-group-sync": true,
        "ldap-group-mappings": { [DEVS_DN]: [3], [OPS_DN]: [3] },
      },
    });
    await clickWhenEnabled(getRowButton(DEVS_DN, "Edit mapping"));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    settingsStore["ldap-group-mappings"] = { [OPS_DN]: [3] };
    store.dispatch(settingsApi.util.invalidateTags(["session-properties"]));

    const addButton = await screen.findByRole("button", {
      name: "Add mapping",
    });
    expect(screen.getByLabelText("LDAP group name")).toHaveValue(DEVS_DN);
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();

    await waitFor(() => expect(addButton).toBeEnabled());
    await userEvent.click(addButton);
    expect(await screen.findByText("Mapping added")).toBeInTheDocument();
    expect(screen.queryByText("Mapping updated")).not.toBeInTheDocument();
    const [{ body }] = await findRequests("PUT");
    expect(body).toEqual({
      "ldap-group-mappings": { [OPS_DN]: [3], [DEVS_DN]: [3] },
    });
  });

  it("tells a screen reader which mapping a row's buttons act on", async () => {
    await setup({
      settingValues: {
        "ldap-group-sync": true,
        "ldap-group-mappings": { [DEVS_DN]: [3] },
      },
    });

    expect(getRowButton(DEVS_DN, "Edit mapping")).toHaveAccessibleDescription(
      DEVS_DN,
    );
    expect(getRowButton(DEVS_DN, "Delete mapping")).toHaveAccessibleDescription(
      DEVS_DN,
    );
  });

  it("opens another row's editor in place of an open draft", async () => {
    await setup({
      settingValues: {
        "ldap-group-sync": true,
        "ldap-group-mappings": { [DEVS_DN]: [3], [OPS_DN]: [4] },
      },
    });
    await clickWhenEnabled(getRowButton(DEVS_DN, "Edit mapping"));
    await userEvent.type(screen.getByLabelText("LDAP group name"), "-team");

    await userEvent.click(getRowButton(OPS_DN, "Edit mapping"));

    expect(screen.getByLabelText("LDAP group name")).toHaveValue(OPS_DN);
    expect(findMappingRow(DEVS_DN)).toBeDefined();
    expect(
      screen.queryByDisplayValue(`${DEVS_DN}-team`),
    ).not.toBeInTheDocument();
  });

  it("keeps an open draft editable while the panel waits for a settings refetch", async () => {
    const { store, settingsStore } = await setup({
      settingValues: { "ldap-group-sync": true },
    });
    await fillNewDraft(DEVS_DN);

    const releaseReads = holdSettingsReads(settingsStore);
    store.dispatch(settingsApi.util.invalidateTags(["session-properties"]));

    const addButton = screen.getByRole("button", { name: "Add mapping" });
    const nameInput = screen.getByLabelText("LDAP group name");
    try {
      await waitFor(() => expect(addButton).toBeDisabled());
      expect(addButton).not.toHaveAttribute("data-loading");
      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
      await userEvent.type(nameInput, "x");
      expect(nameInput).toHaveValue(`${DEVS_DN}x`);
    } finally {
      releaseReads();
    }
    await waitFor(() => expect(addButton).toBeEnabled());
  });

  it("leaves Enter and Escape to an input method that is composing", async () => {
    await setup({ settingValues: { "ldap-group-sync": true } });
    await fillNewDraft(DEVS_DN);
    const nameInput = screen.getByLabelText("LDAP group name");

    fireEvent.keyDown(nameInput, { key: "Enter", isComposing: true });
    expect(
      screen.getByRole("button", { name: "Add mapping" }),
    ).not.toHaveAttribute("data-loading");
    fireEvent.keyDown(nameInput, { key: "Escape", isComposing: true });
    expect(nameInput).toBeInTheDocument();
    const isGroupsEnterKept = fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Metabase groups" }),
      { key: "Enter", isComposing: true },
    );
    expect(isGroupsEnterKept).toBe(true);

    await userEvent.click(nameInput);
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("Mapping added")).toBeInTheDocument();
  });

  it("asks before leaving with an unsaved mapping draft", async () => {
    const { router } = await setup({
      settingValues: { "ldap-group-sync": true },
      withRouter: true,
    });
    const routerWithRoutes = checkNotNull(router);
    await clickWhenEnabled(screen.getByRole("button", { name: "New" }));
    await userEvent.type(screen.getByLabelText("LDAP group name"), DEVS_DN);

    act(() => routerWithRoutes.navigate("/people"));

    expect(
      await screen.findByText("Discard your changes?"),
    ).toBeInTheDocument();
    expect(routerWithRoutes.location.pathname).toBe("/ldap");
  });

  it("leaves without asking when the draft is untouched", async () => {
    const { router } = await setup({
      settingValues: { "ldap-group-sync": true },
      withRouter: true,
    });
    await clickWhenEnabled(screen.getByRole("button", { name: "New" }));

    act(() => checkNotNull(router).navigate("/people"));

    expect(await screen.findByText("People")).toBeInTheDocument();
    expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument();
  });

  it("leaves without asking when an opened edit is untouched", async () => {
    const { router } = await setup({
      settingValues: {
        "ldap-group-sync": true,
        "ldap-group-mappings": { [DEVS_DN]: [3] },
      },
      withRouter: true,
    });
    await clickWhenEnabled(getRowButton(DEVS_DN, "Edit mapping"));

    act(() => checkNotNull(router).navigate("/people"));

    expect(await screen.findByText("People")).toBeInTheDocument();
    expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument();
  });

  it("holds the mapping controls until the groups have loaded", async () => {
    await setup({
      settingValues: {
        "ldap-group-sync": true,
        "ldap-group-mappings": { [DEVS_DN]: [3] },
      },
      groupsDelay: 200,
    });
    const newButton = () => screen.getByRole("button", { name: "New" });
    const editButton = () => getRowButton(DEVS_DN, "Edit mapping");
    expect(newButton()).toBeDisabled();
    expect(editButton()).toBeDisabled();
    const row = getMappingRow(DEVS_DN);
    expect(within(row).queryByText("No groups")).not.toBeInTheDocument();

    await waitFor(() => expect(newButton()).toBeEnabled());
    expect(editButton()).toBeEnabled();
    expect(await within(row).findByText("Engineering")).toBeInTheDocument();
  });

  it("says No groups for a mapping without groups", async () => {
    await setup({
      settingValues: {
        "ldap-group-sync": true,
        "ldap-group-mappings": { [DEVS_DN]: [] },
      },
    });

    expect(
      await within(getMappingRow(DEVS_DN)).findByText("No groups"),
    ).toBeInTheDocument();
  });

  it("says so when the groups could not be loaded", async () => {
    await setup({
      settingValues: {
        "ldap-group-sync": true,
        "ldap-group-mappings": { [DEVS_DN]: [3] },
      },
      groupsStatus: 500,
    });

    expect(
      await screen.findByText("Groups could not be loaded"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeDisabled();
    expect(
      within(getMappingRow(DEVS_DN)).queryByText("No groups"),
    ).not.toBeInTheDocument();
  });

  it("reports a failed clean-up after deleting a mapping's groups as part of the deletion", async () => {
    const OLD_DN = "cn=old,ou=groups,dc=example,dc=org";
    const { settingsStore } = await setup({
      settingValues: {
        "ldap-group-sync": true,
        "ldap-group-mappings": { [OLD_DN]: [4], [DEVS_DN]: [4, 3] },
      },
    });
    fetchMock.delete("express:/api/permissions/group/:id", 204);
    let writeCount = 0;
    fetchMock.removeRoute("update-settings");
    fetchMock.put(
      "path:/api/setting",
      ({ options }) => {
        writeCount += 1;
        if (writeCount > 1) {
          return { status: 500 };
        }
        Object.assign(settingsStore, JSON.parse(String(options.body)));
        return { status: 204 };
      },
      { name: "update-settings" },
    );

    await clickWhenEnabled(getRowButton(OLD_DN, "Delete mapping"));
    await userEvent.click(
      await screen.findByRole("radio", { name: "Also delete the group" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove mapping and delete group" }),
    );

    expect(
      await screen.findByText(
        "Mapping deleted, but its deleted group could not be removed from the other mappings",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Error saving group mapping"),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(findMappingRow(OLD_DN)).toBeUndefined());
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
      await screen.findByText("Using MB_LDAP_GROUP_MAPPINGS"),
    ).toBeInTheDocument();
    const row = findMappingRow(DEVS_DN);
    expect(row).toBeDefined();
    expect(await within(row!).findByText("Engineering")).toBeInTheDocument();
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

    expect(
      await screen.findByText("Using MB_LDAP_GROUP_SYNC"),
    ).toBeInTheDocument();
    expect(groupMappingSwitch()).toBeChecked();
    expect(groupMappingSwitch()).toHaveAttribute("aria-disabled", "true");
    expect(groupMappingSwitch()).toHaveAccessibleDescription(
      /Using MB_LDAP_GROUP_SYNC/,
    );
    expect(screen.getByText("Manual group mappings")).toBeInTheDocument();
  });
});
