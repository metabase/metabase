import userEvent from "@testing-library/user-event";

import { setupGroupsEndpoint } from "__support__/server-mocks/group";
import {
  setupMetabotGroupPermissionsEndpoint,
  setupUpdateMetabotGroupPermissionsEndpoint,
} from "__support__/server-mocks/metabot";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { AIToolKey, type MetabotGroupPermission } from "metabase-types/api";
import { createMockGroup } from "metabase-types/api/mocks";
import { createMockMetabotGroupPermissions } from "metabase-types/api/mocks/metabot";

import { MetabotFeatureAccessPage } from "./MetabotFeatureAccessPage";

const adminGroup = createMockGroup({
  id: 1,
  name: "Administrators",
  member_count: 1,
  magic_group_type: "admin",
});

const allUsersGroup = createMockGroup({
  id: 2,
  name: "All Users",
  member_count: 5,
  magic_group_type: "all-internal-users",
});

const marketingGroup = createMockGroup({
  id: 3,
  name: "Marketing",
  member_count: 3,
  magic_group_type: null,
});

const defaultGroups = [adminGroup, allUsersGroup, marketingGroup];

function createDefaultPermissions(): MetabotGroupPermission[] {
  return [
    ...createMockMetabotGroupPermissions(adminGroup.id),
    ...createMockMetabotGroupPermissions(allUsersGroup.id, {
      [AIToolKey.SQLGeneration]: "no",
    }),
    ...createMockMetabotGroupPermissions(marketingGroup.id, {
      [AIToolKey.Metabot]: "no",
      [AIToolKey.ChatAndNLQ]: "no",
      [AIToolKey.SQLGeneration]: "no",
      [AIToolKey.OtherTools]: "no",
    }),
  ];
}

function setup({
  permissions = createDefaultPermissions(),
  groups = defaultGroups,
  useTenants = false,
  advanced = false,
}: {
  permissions?: MetabotGroupPermission[];
  groups?: typeof defaultGroups;
  useTenants?: boolean;
  advanced?: boolean;
} = {}) {
  setupGroupsEndpoint(groups);
  setupMetabotGroupPermissionsEndpoint(permissions, advanced);
  setupUpdateMetabotGroupPermissionsEndpoint();

  renderWithProviders(<MetabotFeatureAccessPage />, {
    storeInitialState: {
      settings: createMockSettingsState({ "use-tenants": useTenants }),
    },
  });
}

function getPermissionRow(groupName: string) {
  return screen.getByRole("row", {
    name: new RegExp(`${groupName} permissions`),
  });
}

describe("MetabotFeatureAccessPage", () => {
  const originalGetBoundingClientRect =
    HTMLElement.prototype.getBoundingClientRect;

  beforeAll(() => {
    // needed for @tanstack/react-virtual, see https://github.com/TanStack/virtual/issues/29#issuecomment-657519522
    HTMLElement.prototype.getBoundingClientRect = jest
      .fn()
      .mockReturnValue({ height: 400, width: 800, top: 0, left: 0 });
  });

  afterAll(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it("renders groups with their permission states", async () => {
    setup({ advanced: true });

    expect(
      await screen.findByTestId("ai-feature-access-table"),
    ).toBeInTheDocument();

    expect(screen.getByText("Administrators")).toBeInTheDocument();
    expect(screen.queryByText("All Users")).not.toBeInTheDocument();
    expect(screen.getByText("Marketing")).toBeInTheDocument();
  });

  it("hides non-admin/non-all-users groups in simple mode", async () => {
    setup();

    await screen.findByTestId("ai-feature-access-table");

    expect(screen.getByText("Administrators")).toBeInTheDocument();
    expect(screen.getByText("All Users")).toBeInTheDocument();
    expect(screen.queryByText("Marketing")).not.toBeInTheDocument();
  });

  it("renders column headers for each AI tool", async () => {
    setup();
    await screen.findByTestId("ai-feature-access-table");

    expect(screen.getByText("AI features")).toBeInTheDocument();
    expect(screen.getByText("Chat and NLQ")).toBeInTheDocument();
    expect(screen.getByText("SQL generation")).toBeInTheDocument();
    expect(screen.getByText("Other tools")).toBeInTheDocument();
  });

  it("shows all admin group controls as checked and disabled", async () => {
    setup();
    await screen.findByTestId("ai-feature-access-table");

    const adminRow = getPermissionRow("Administrators");

    const metabotSwitch = within(adminRow).getByRole("switch");
    expect(metabotSwitch).toBeChecked();
    expect(metabotSwitch).toBeDisabled();

    const checkboxes = within(adminRow).getAllByRole("checkbox");
    checkboxes.forEach((checkbox) => {
      expect(checkbox).toBeChecked();
      expect(checkbox).toBeDisabled();
    });
  });

  it("shows correct permission states for a group with mixed permissions", async () => {
    setup();
    await screen.findByTestId("ai-feature-access-table");

    const allUsersRow = getPermissionRow("All Users");

    // Wait for permissions to propagate through the async state pipeline
    await waitFor(() => {
      const metabotSwitch = within(allUsersRow).getByRole("switch");
      expect(metabotSwitch).toBeChecked();
    });

    const sqlCheckbox = within(allUsersRow).getByRole("checkbox", {
      name: /SQL generation/,
    });
    expect(sqlCheckbox).not.toBeChecked();

    const chatCheckbox = within(allUsersRow).getByRole("checkbox", {
      name: /Chat and NLQ/,
    });
    expect(chatCheckbox).toBeChecked();
  });

  it("leaves sub-permission checkboxes enabled when metabot is off for a group", async () => {
    setup({ advanced: true });
    await screen.findByTestId("ai-feature-access-table");

    const marketingRow = getPermissionRow("Marketing");
    const metabotSwitch = within(marketingRow).getByRole("switch");
    expect(metabotSwitch).not.toBeChecked();

    const checkboxes = within(marketingRow).getAllByRole("checkbox");
    checkboxes.forEach((checkbox) => {
      expect(checkbox).toBeEnabled();
      expect(checkbox).not.toBeChecked();
    });
  });

  it("checks every sub-permission when toggling metabot on for a group", async () => {
    setup({ advanced: true });
    await screen.findByTestId("ai-feature-access-table");

    const marketingRow = getPermissionRow("Marketing");
    const metabotSwitch = within(marketingRow).getByRole("switch");

    await userEvent.click(metabotSwitch);

    expect(metabotSwitch).toBeChecked();
    const checkboxes = within(marketingRow).getAllByRole("checkbox");
    checkboxes.forEach((checkbox) => {
      expect(checkbox).toBeEnabled();
      expect(checkbox).toBeChecked();
    });
  });

  it("unchecks every sub-permission when toggling metabot off for a group", async () => {
    setup();
    await screen.findByTestId("ai-feature-access-table");

    const allUsersRow = getPermissionRow("All Users");
    const metabotSwitch = within(allUsersRow).getByRole("switch");

    // Wait for permissions to load so the switch reflects the initial "yes" state
    await waitFor(() => {
      expect(metabotSwitch).toBeChecked();
    });

    await userEvent.click(metabotSwitch);

    expect(metabotSwitch).not.toBeChecked();
    const checkboxes = within(allUsersRow).getAllByRole("checkbox");
    checkboxes.forEach((checkbox) => {
      expect(checkbox).toBeEnabled();
      expect(checkbox).not.toBeChecked();
    });
  });

  it("auto-enables metabot when a tool is checked while metabot is off", async () => {
    setup({ advanced: true });
    await screen.findByTestId("ai-feature-access-table");

    const marketingRow = getPermissionRow("Marketing");
    const metabotSwitch = within(marketingRow).getByRole("switch");
    expect(metabotSwitch).not.toBeChecked();

    const chatCheckbox = within(marketingRow).getByRole("checkbox", {
      name: /Chat and NLQ/,
    });
    await userEvent.click(chatCheckbox);

    expect(metabotSwitch).toBeChecked();
    expect(chatCheckbox).toBeChecked();
    // Other tools should remain unchecked — only the clicked one and metabot flip on
    expect(
      within(marketingRow).getByRole("checkbox", { name: /SQL generation/ }),
    ).not.toBeChecked();
    expect(
      within(marketingRow).getByRole("checkbox", { name: /Other tools/ }),
    ).not.toBeChecked();
  });

  it("auto-disables metabot when the last enabled tool is unchecked", async () => {
    const onlyChatEnabled = [
      ...createMockMetabotGroupPermissions(adminGroup.id),
      ...createMockMetabotGroupPermissions(allUsersGroup.id, {
        [AIToolKey.SQLGeneration]: "no",
        [AIToolKey.OtherTools]: "no",
      }),
      ...createMockMetabotGroupPermissions(marketingGroup.id, {
        [AIToolKey.Metabot]: "no",
        [AIToolKey.ChatAndNLQ]: "no",
        [AIToolKey.SQLGeneration]: "no",
        [AIToolKey.OtherTools]: "no",
      }),
    ];
    setup({ permissions: onlyChatEnabled });
    await screen.findByTestId("ai-feature-access-table");

    const allUsersRow = getPermissionRow("All Users");
    const metabotSwitch = within(allUsersRow).getByRole("switch");
    await waitFor(() => expect(metabotSwitch).toBeChecked());

    const chatCheckbox = within(allUsersRow).getByRole("checkbox", {
      name: /Chat and NLQ/,
    });
    await waitFor(() => expect(chatCheckbox).toBeChecked());

    await userEvent.click(chatCheckbox);

    expect(chatCheckbox).not.toBeChecked();
    expect(metabotSwitch).not.toBeChecked();
  });

  it("does not affect other groups when one group's permissions change", async () => {
    const engineeringGroup = createMockGroup({
      id: 4,
      name: "Engineering",
      member_count: 4,
      magic_group_type: null,
    });
    const permissions = [
      ...createMockMetabotGroupPermissions(adminGroup.id),
      ...createMockMetabotGroupPermissions(allUsersGroup.id),
      ...createMockMetabotGroupPermissions(marketingGroup.id, {
        [AIToolKey.Metabot]: "no",
        [AIToolKey.ChatAndNLQ]: "no",
        [AIToolKey.SQLGeneration]: "no",
        [AIToolKey.OtherTools]: "no",
      }),
      ...createMockMetabotGroupPermissions(engineeringGroup.id),
    ];
    setup({
      advanced: true,
      groups: [...defaultGroups, engineeringGroup],
      permissions,
    });
    await screen.findByTestId("ai-feature-access-table");

    const engineeringRow = getPermissionRow("Engineering");
    const engineeringSwitch = within(engineeringRow).getByRole("switch");
    const engineeringCheckboxes =
      within(engineeringRow).getAllByRole("checkbox");

    // Wait for the fully-enabled engineering row to settle
    await waitFor(() => expect(engineeringSwitch).toBeChecked());
    engineeringCheckboxes.forEach((checkbox) => {
      expect(checkbox).toBeChecked();
    });

    // Auto-enable on a tool in Marketing — would have flipped engineering's metabot
    // in the previous (buggy) implementation that didn't filter by group_id
    const marketingRow = getPermissionRow("Marketing");
    await userEvent.click(
      within(marketingRow).getByRole("checkbox", { name: /Chat and NLQ/ }),
    );

    // Sanity: the change landed on Marketing
    expect(within(marketingRow).getByRole("switch")).toBeChecked();

    // Engineering must remain fully enabled — no cross-group leak
    expect(engineeringSwitch).toBeChecked();
    engineeringCheckboxes.forEach((checkbox) => {
      expect(checkbox).toBeChecked();
    });

    // And the inverse leak: unchecking Marketing's last enabled tool would
    // previously disable Engineering's metabot via the shared cascade path
    await userEvent.click(
      within(marketingRow).getByRole("checkbox", { name: /Chat and NLQ/ }),
    );
    expect(within(marketingRow).getByRole("switch")).not.toBeChecked();
    expect(engineeringSwitch).toBeChecked();
    engineeringCheckboxes.forEach((checkbox) => {
      expect(checkbox).toBeChecked();
    });
  });

  it("does not show tenant tabs when use-tenants is false", async () => {
    setup({ useTenants: false });
    await screen.findByTestId("ai-feature-access-table");

    expect(screen.queryByText("User groups")).not.toBeInTheDocument();
    expect(screen.queryByText("Tenant groups")).not.toBeInTheDocument();
  });

  it("shows tenant tabs when use-tenants is true", async () => {
    setup({ useTenants: true });
    await screen.findByTestId("ai-feature-access-table");

    expect(screen.getByText("User groups")).toBeInTheDocument();
    expect(screen.getByText("Tenant groups")).toBeInTheDocument();
  });

  it("renders the group name next to its AI features switch in the first cell", async () => {
    setup();
    await screen.findByTestId("ai-feature-access-table");

    const adminRow = getPermissionRow("Administrators");
    const gridcell = within(adminRow).getAllByRole("gridcell")[0];
    expect(within(gridcell).getByRole("switch")).toBeInTheDocument();
    expect(within(gridcell).getByText("Administrators")).toBeInTheDocument();
  });

  it("shows the 'Switch to group-level permissions' button in simple mode", async () => {
    setup();
    await screen.findByTestId("ai-feature-access-table");

    expect(
      screen.getByRole("button", { name: "Switch to group-level permissions" }),
    ).toBeInTheDocument();
  });

  it("hides the 'Switch to group-level permissions' button in advanced mode", async () => {
    setup({ advanced: true });
    await screen.findByTestId("ai-feature-access-table");

    expect(
      screen.queryByRole("button", {
        name: "Switch to group-level permissions",
      }),
    ).not.toBeInTheDocument();
  });
});
