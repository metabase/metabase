import userEvent from "@testing-library/user-event";

import { setupGroupsEndpoint } from "__support__/server-mocks/group";
import {
  setupMetabotGroupPermissionsEndpoint,
  setupUpdateMetabotGroupPermissionsEndpoint,
} from "__support__/server-mocks/metabot";
import { renderWithProviders, screen, within } from "__support__/ui";
import { AIToolKey, type MetabotGroupPermission } from "metabase-types/api";
import { createMockGroup } from "metabase-types/api/mocks";
import { createMockMetabotGroupPermissions } from "metabase-types/api/mocks/metabot";
import { createMockSettingsState } from "metabase-types/store/mocks";

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
    const metabotSwitch = within(allUsersRow).getByRole("switch");
    expect(metabotSwitch).toBeChecked();

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
});
