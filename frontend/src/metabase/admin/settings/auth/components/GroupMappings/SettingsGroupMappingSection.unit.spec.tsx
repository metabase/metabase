import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupSettingsEndpoints,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import { createMockSettingsState, createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
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
];

const DEVS_DN = "cn=devs,ou=groups,dc=example,dc=org";

// the admin list only carries values that were set, so the test values stand in for those
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

const setup = async ({
  settingValues = {},
  settingDefinitions = [],
  updateDelay,
  readDelay,
}: {
  settingValues?: Partial<EnterpriseSettings>;
  // entries here win over the ones derived from settingValues
  settingDefinitions?: SettingDefinition[];
  updateDelay?: number;
  readDelay?: number;
} = {}) => {
  const settings = createMockSettings(settingValues);
  const listedKeys = new Set(
    settingDefinitions.map((definition) => definition.key),
  );
  setupSettingsEndpoints([
    ...settingDefinitions,
    ...toDefinitions(settingValues).filter(({ key }) => !listedKeys.has(key)),
  ]);
  // the switch and the mappings read their values back after saving, so the properties mock has to remember writes
  setupStatefulSettingsEndpoints(settings, { updateDelay, readDelay });
  fetchMock.get("path:/api/permissions/group", GROUPS);

  renderWithProviders(
    <SettingsGroupMappingSection
      syncSettingKey="ldap-group-sync"
      mappingsSettingKey="ldap-group-mappings"
      description="Assign people to groups based on their LDAP groups"
      nameLabel="LDAP group name"
      namePlaceholder="cn=people,ou=groups,dc=example,dc=org"
    >
      <div>Group fields</div>
    </SettingsGroupMappingSection>,
    {
      withUndos: true,
      storeInitialState: createMockState({
        settings: createMockSettingsState(settings),
      }),
    },
  );

  // the switch is held while the settings load, so a click before that would be ignored
  if (settingValues["ldap-group-sync"] === true) {
    await screen.findByText("Manual group mappings");
  } else {
    await waitFor(() =>
      expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled"),
    );
  }
};

describe("SettingsGroupMappingSection", () => {
  it("shows the new value and holds the switch while the write is in flight", async () => {
    // the settings mock answers the write late, so the in-flight state can be seen
    await setup({ updateDelay: 200 });

    await userEvent.click(groupMappingSwitch());

    expect(groupMappingSwitch()).toBeChecked();
    expect(groupMappingSwitch()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Manual group mappings")).toBeInTheDocument();
    await waitFor(() =>
      expect(groupMappingSwitch()).not.toHaveAttribute("aria-disabled"),
    );
    expect(groupMappingSwitch()).toBeChecked();
    expect(await findRequests("PUT")).toHaveLength(1);
  });

  it("holds the switch until the settings refetch after the write lands", async () => {
    // the properties mock answers reads late, so the refetch the write triggers can be seen
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

  it("puts the old value back when the write fails", async () => {
    await setup();
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

    // the env line comes from the settings list, a second request the card does not wait for
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
