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
import { DatabasesPermissionsPage } from "metabase/admin/permissions/pages/DatabasePermissionsPage/DatabasesPermissionsPage";
import { PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES } from "metabase/plugins";
import { Route } from "metabase/router";
import type { SchemasPermissions } from "metabase-types/api";
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

const MANAGE_TABLE_METADATA_INDEX = 3;
const MANAGE_DATABASE_INDEX = 4;

interface SetupOpts {
  tenantGroupViewData?: SchemasPermissions;
}

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

const setup = async ({
  tenantGroupViewData = DataPermissionValue.BLOCKED,
}: SetupOpts = {}) => {
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupPermissionsGraphEndpoints(TEST_GROUPS, [TEST_DATABASE], {
    [TENANT_GROUP.id]: {
      [DataPermission.VIEW_DATA]: tenantGroupViewData,
      [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
    },
  });
  setupGroupsEndpoint(TEST_GROUPS);
  setupTokenStatusEndpoint({ valid: true });

  fetchMock.get(
    `path:/api/database/${TEST_DATABASE.id}/metadata`,
    TEST_DATABASE,
  );

  renderWithProviders(
    <Route path="/admin/permissions/data" element={<DataPermissionsPage />}>
      {["database", "database/:databaseId"].map((path) => (
        <Route key={path} path={path} element={<DatabasesPermissionsPage />}>
          {PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES}
        </Route>
      ))}
    </Route>,
    {
      withRouter: true,
      initialRoute: `/admin/permissions/data/database/${TEST_DATABASE.id}`,
      storeInitialState: createMockState({ settings: SETTINGS_STATE }),
    },
  );

  await waitForLoaderToBeRemoved();
};

const getGroupRow = (groupName: string) =>
  screen.findByRole("row", { name: `${groupName} permissions` });

describe("DatabasesPermissionsPage with tenants", () => {
  describe("tenant group marker", () => {
    it.each([ALL_TENANT_USERS, TENANT_GROUP])(
      "marks $name with a globe",
      async (group) => {
        await setup();

        expect(
          within(await getGroupRow(group.name)).getByLabelText("globe icon"),
        ).toBeInTheDocument();
      },
    );

    it.each([ALL_INTERNAL_USERS, ADMINISTRATORS])(
      "leaves $name unmarked",
      async (group) => {
        await setup();

        expect(
          within(await getGroupRow(group.name)).queryByLabelText("globe icon"),
        ).not.toBeInTheDocument();
      },
    );
  });

  describe("database management permissions", () => {
    it("locks table metadata and database management for the tenant default group", async () => {
      await setup();

      const permissions = within(
        await getGroupRow(ALL_TENANT_USERS.name),
      ).getAllByTestId("permissions-select");

      expect(permissions[MANAGE_TABLE_METADATA_INDEX]).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(permissions[MANAGE_DATABASE_INDEX]).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    it("leaves them editable for an internal group", async () => {
      await setup();

      const permissions = within(
        await getGroupRow(ALL_INTERNAL_USERS.name),
      ).getAllByTestId("permissions-select");

      expect(permissions[MANAGE_TABLE_METADATA_INDEX]).toHaveAttribute(
        "aria-disabled",
        "false",
      );
      expect(permissions[MANAGE_DATABASE_INDEX]).toHaveAttribute(
        "aria-disabled",
        "false",
      );
    });
  });

  describe("permission warning (UXW-2624)", () => {
    it("names the tenant default group in the warning tooltip", async () => {
      await setup();

      const row = await getGroupRow(TENANT_GROUP.name);
      expect(row).toHaveTextContent("Blocked");

      await userEvent.hover(within(row).getAllByLabelText("warning icon")[0]);

      const tooltip = await screen.findByRole("tooltip");
      expect(tooltip).toHaveTextContent(
        'The "All tenant users" group has a higher level of access',
      );
      expect(tooltip).not.toHaveTextContent("internal users");
    });

    it("names the tenant default group in the revoke confirmation", async () => {
      await setup({ tenantGroupViewData: DataPermissionValue.UNRESTRICTED });

      const row = await getGroupRow(TENANT_GROUP.name);
      await userEvent.click(within(row).getByText("Can view"));
      await userEvent.click(await screen.findByText("Blocked"));

      const modal = await screen.findByRole("dialog");
      expect(modal).toHaveTextContent(
        'Revoke access even though "All tenant users" has greater access?',
      );
      expect(modal).toHaveTextContent(
        'The "All tenant users" group has a higher level of access',
      );
      expect(modal).not.toHaveTextContent("internal users");
    });
  });
});
