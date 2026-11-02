import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDatabasesEndpoints,
  setupGroupsEndpoint,
  setupPermissionsGraphEndpoints,
  setupTokenStatusEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { DataPermissionsPage } from "metabase/admin/permissions/pages/DataPermissionsPage/DataPermissionsPage";
import { GroupsPermissionsPage } from "metabase/admin/permissions/pages/GroupDataPermissionsPage/GroupsPermissionsPage";
import { PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES } from "metabase/plugins";
import { Route } from "metabase/router";
import type { DatabasePermissions, GroupId } from "metabase-types/api";
import { DataPermission, DataPermissionValue } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockGroup } from "metabase-types/api/mocks/group";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

const TEST_DATABASE = createSampleDatabase();

const ALL_INTERNAL_USERS = createMockGroup({
  id: 1,
  name: "All internal users",
  magic_group_type: "all-internal-users",
});

const ADMINISTRATORS = createMockGroup({
  id: 2,
  name: "Administrators",
  magic_group_type: "admin",
});

const ALL_TENANT_USERS = createMockGroup({
  id: 3,
  name: "All tenant users",
  magic_group_type: "all-external-users",
  is_tenant_group: true,
});

const TENANT_GROUP = createMockGroup({
  id: 4,
  name: "Test Tenant Group",
  magic_group_type: null,
  is_tenant_group: true,
});

const TEST_GROUPS = [
  ALL_INTERNAL_USERS,
  ADMINISTRATORS,
  ALL_TENANT_USERS,
  TENANT_GROUP,
];

// A freshly created tenant group starts out blocked, which is what makes the
// "All tenant users" group's wider access worth warning about. Pinned on the
// backend by metabase-enterprise.tenants.permissions-test/
// new-tenant-groups-get-no-perms-on-existing-dbs.
const BLOCKED_TENANT_GROUP_PERMISSIONS: Partial<
  Record<GroupId, Partial<DatabasePermissions>>
> = {
  [TENANT_GROUP.id]: {
    [DataPermission.VIEW_DATA]: DataPermissionValue.BLOCKED,
    [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
  },
};

const SETTINGS_STATE = mockSettings({
  "token-features": createMockTokenFeatures({
    tenants: true,
    advanced_permissions: true,
  }),
  "use-tenants": true,
});

// The tenant plugin pushes its permission tabs onto a shared slot, so it has to
// be registered exactly once for the whole file.
beforeAll(() => {
  setupEnterprisePlugins();
});

const setup = async ({ groupId }: { groupId: number }) => {
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupPermissionsGraphEndpoints(
    TEST_GROUPS,
    [TEST_DATABASE],
    BLOCKED_TENANT_GROUP_PERMISSIONS,
  );
  setupGroupsEndpoint(TEST_GROUPS);
  setupTokenStatusEndpoint({ valid: true });

  fetchMock.get(
    `path:/api/database/${TEST_DATABASE.id}/metadata`,
    TEST_DATABASE,
  );

  renderWithProviders(
    <Route path="/admin/permissions/data" element={<DataPermissionsPage />}>
      {["group", "group/:groupId"].map((path) => (
        <Route key={path} path={path} element={<GroupsPermissionsPage />}>
          {PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES}
        </Route>
      ))}
    </Route>,
    {
      withRouter: true,
      initialRoute: `/admin/permissions/data/group/${groupId}`,
      storeInitialState: createMockState({ settings: SETTINGS_STATE }),
    },
  );

  await waitForLoaderToBeRemoved();
};

const getDatabaseRow = () =>
  screen.findByRole("row", { name: `${TEST_DATABASE.name} permissions` });

const getColumnNames = () =>
  screen
    .getAllByRole("columnheader")
    .map((header) => header.textContent?.trim());

describe("GroupsPermissionsPage with tenants", () => {
  describe("columns", () => {
    it("offers an internal group every data permission", async () => {
      await setup({ groupId: ADMINISTRATORS.id });

      expect(getColumnNames()).toEqual([
        "Database name",
        "View data",
        "Create queries",
        "Download results",
        "Manage table metadata",
        "Manage database",
      ]);
    });

    it.each([ALL_TENANT_USERS, TENANT_GROUP])(
      "offers $name no table metadata or database permissions",
      async (group) => {
        await setup({ groupId: group.id });

        expect(getColumnNames()).toEqual([
          "Database name",
          "View data",
          "Create queries",
          "Download results",
        ]);
      },
    );
  });

  describe("permission warning (UXW-2474)", () => {
    it("names the tenant default group, not the internal one, when a tenant group has less access", async () => {
      // The page loads the graph of the focused group only, so the warning can
      // only compare against "All tenant users" once that group has been
      // visited. Walking there first mirrors how the sidebar is used.
      await setup({ groupId: ALL_TENANT_USERS.id });

      let row = await getDatabaseRow();
      expect(
        within(row).getAllByTestId("permissions-select")[0],
      ).toHaveTextContent("Can view");

      await userEvent.click(
        await screen.findByRole("menuitem", { name: TENANT_GROUP.name }),
      );

      row = await getDatabaseRow();
      const viewDataCell = within(row).getAllByTestId("permissions-select")[0];
      expect(viewDataCell).toHaveTextContent("Blocked");

      await userEvent.hover(
        within(viewDataCell).getByLabelText("warning icon"),
      );

      const tooltip = await screen.findByRole("tooltip");
      expect(tooltip).toHaveTextContent(
        'The "All tenant users" group has a higher level of access',
      );
      expect(tooltip).not.toHaveTextContent("All internal users");
    });
  });
});
