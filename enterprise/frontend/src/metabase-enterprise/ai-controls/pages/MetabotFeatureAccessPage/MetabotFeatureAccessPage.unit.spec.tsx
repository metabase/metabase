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
}: {
  permissions?: MetabotGroupPermission[];
  groups?: typeof defaultGroups;
  useTenants?: boolean;
} = {}) {
  setupGroupsEndpoint(groups);
  setupMetabotGroupPermissionsEndpoint(permissions);
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

const dataAnalystsGroup = createMockGroup({
  id: 4,
  name: "Data Analysts",
  member_count: 2,
  magic_group_type: "data-analyst",
});

describe("MetabotFeatureAccessPage", () => {
  it("renders groups with their permission states", async () => {
    setup();

    expect(
      await screen.findByTestId("ai-feature-access-table"),
    ).toBeInTheDocument();

    expect(screen.getByText("Administrators")).toBeInTheDocument();
    expect(screen.getByText("All Users")).toBeInTheDocument();
    expect(screen.getByText("Marketing")).toBeInTheDocument();
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

  it("disables sub-permission checkboxes when metabot is off for a group", async () => {
    setup();
    await screen.findByTestId("ai-feature-access-table");

    const marketingRow = getPermissionRow("Marketing");
    const metabotSwitch = within(marketingRow).getByRole("switch");
    expect(metabotSwitch).not.toBeChecked();

    const checkboxes = within(marketingRow).getAllByRole("checkbox");
    checkboxes.forEach((checkbox) => {
      expect(checkbox).toBeDisabled();
    });
  });

  it("enables sub-permission checkboxes after toggling metabot on", async () => {
    setup();
    await screen.findByTestId("ai-feature-access-table");

    const marketingRow = getPermissionRow("Marketing");
    const metabotSwitch = within(marketingRow).getByRole("switch");

    await userEvent.click(metabotSwitch);

    expect(metabotSwitch).toBeChecked();
    const checkboxes = within(marketingRow).getAllByRole("checkbox");
    checkboxes.forEach((checkbox) => {
      expect(checkbox).toBeEnabled();
    });
  });

  it("unchecks and disables sub-permissions when toggling metabot off", async () => {
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
      expect(checkbox).toBeDisabled();
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

  describe("'All Users' group override warning icons", () => {
    // defaultPermissions: All Users group has everything enabled; Data Analysts has everything disabled
    const defaultPermissions = [
      ...createMockMetabotGroupPermissions(adminGroup.id),
      ...createMockMetabotGroupPermissions(allUsersGroup.id),
      ...createMockMetabotGroupPermissions(dataAnalystsGroup.id, {
        [AIToolKey.Metabot]: "no",
        [AIToolKey.ChatAndNLQ]: "no",
        [AIToolKey.SQLGeneration]: "no",
        [AIToolKey.OtherTools]: "no",
      }),
    ];

    it("shows info icons on a group's row when 'All Users' has higher access", async () => {
      setup({
        groups: [adminGroup, allUsersGroup, dataAnalystsGroup],
        permissions: defaultPermissions,
      });

      await screen.findByTestId("ai-feature-access-table");

      const dataAnalystsRow = getPermissionRow("Data Analysts");

      // Wait for permissions to propagate
      await waitFor(() => {
        const infoIcons = within(dataAnalystsRow).getAllByRole("img", {
          name: "Group limit warning",
        });
        // One icon per tool column (AI features switch + 3 checkboxes)
        expect(infoIcons).toHaveLength(4);
      });
    });

    it("shows info icon only for tools where 'All Users' has higher access", async () => {
      const permissions = [
        ...createMockMetabotGroupPermissions(adminGroup.id),
        ...createMockMetabotGroupPermissions(allUsersGroup.id, {
          [AIToolKey.SQLGeneration]: "no",
        }),
        ...createMockMetabotGroupPermissions(dataAnalystsGroup.id, {
          [AIToolKey.ChatAndNLQ]: "no",
          [AIToolKey.SQLGeneration]: "no",
          [AIToolKey.OtherTools]: "no",
        }),
      ];

      setup({
        groups: [adminGroup, allUsersGroup, dataAnalystsGroup],
        permissions,
      });

      await screen.findByTestId("ai-feature-access-table");

      const dataAnalystsRow = getPermissionRow("Data Analysts");

      await waitFor(() => {
        // Only ChatAndNLQ and OtherTools are overridden — SQLGeneration is "no" for both
        const infoIcons = within(dataAnalystsRow).getAllByRole("img", {
          name: "Group limit warning",
        });
        expect(infoIcons).toHaveLength(2);
      });
    });

    it("does not show info icons on the 'All Users' row itself", async () => {
      setup();
      await screen.findByTestId("ai-feature-access-table");

      const allUsersRow = getPermissionRow("All Users");

      await waitFor(() => {
        expect(within(allUsersRow).getByRole("switch")).toBeInTheDocument();
      });

      expect(
        within(allUsersRow).queryByRole("img", { name: "Group limit warning" }),
      ).not.toBeInTheDocument();
    });

    it("does not show info icons when 'All Users' has equal or lower access", async () => {
      // All Users has SQL generation disabled; Data Analysts also has it disabled — no override
      const permissions = [
        ...createMockMetabotGroupPermissions(adminGroup.id),
        ...createMockMetabotGroupPermissions(allUsersGroup.id, {
          [AIToolKey.SQLGeneration]: "no",
        }),
        ...createMockMetabotGroupPermissions(dataAnalystsGroup.id, {
          [AIToolKey.SQLGeneration]: "no",
        }),
      ];

      setup({
        groups: [adminGroup, allUsersGroup, dataAnalystsGroup],
        permissions,
      });

      await screen.findByTestId("ai-feature-access-table");

      const dataAnalystsRow = getPermissionRow("Data Analysts");

      await waitFor(() => {
        expect(within(dataAnalystsRow).getByRole("switch")).toBeInTheDocument();
      });

      expect(
        within(dataAnalystsRow).queryByRole("img", {
          name: "Group limit warning",
        }),
      ).not.toBeInTheDocument();
    });

    it("does not show info icons when 'All Users' AI features switch is off, even if sub-tools are on", async () => {
      const permissions = [
        ...createMockMetabotGroupPermissions(adminGroup.id),
        ...createMockMetabotGroupPermissions(allUsersGroup.id, {
          [AIToolKey.Metabot]: "no",
          // ChatAndNLQ, SQLGeneration, OtherTools remain "yes" in state
        }),
        ...createMockMetabotGroupPermissions(dataAnalystsGroup.id, {
          [AIToolKey.ChatAndNLQ]: "no",
          [AIToolKey.SQLGeneration]: "no",
          [AIToolKey.OtherTools]: "no",
        }),
      ];

      setup({
        groups: [adminGroup, allUsersGroup, dataAnalystsGroup],
        permissions,
      });

      await screen.findByTestId("ai-feature-access-table");

      const dataAnalystsRow = getPermissionRow("Data Analysts");

      await waitFor(() => {
        expect(within(dataAnalystsRow).getByRole("switch")).toBeInTheDocument();
      });

      expect(
        within(dataAnalystsRow).queryByRole("img", {
          name: "Group limit warning",
        }),
      ).not.toBeInTheDocument();
    });
  });
});
