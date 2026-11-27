import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { callMockEvent } from "__support__/events";
import {
  setupDatabasesEndpoints,
  setupGroupsEndpoint,
  setupPermissionsGraphEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { delay } from "__support__/utils";
import { DataPermissionsPage } from "metabase/admin/permissions/pages/DataPermissionsPage/DataPermissionsPage";
import { GroupsPermissionsPage } from "metabase/admin/permissions/pages/GroupDataPermissionsPage/GroupsPermissionsPage";
import { getBeforeUnloadUnsavedMessage } from "metabase/common/hooks/use-before-unload";
import {
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES,
  reinitialize,
} from "metabase/plugins";
import { Route } from "metabase/router";
import type { Database, EnterpriseSettings } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockGroup } from "metabase-types/api/mocks/group";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
const NATIVE_QUERIES_PERMISSION_INDEX = 0;

const TEST_DATABASE = createSampleDatabase();

const TEST_GROUPS = [
  createMockGroup({ id: 2, name: "Administrators", magic_group_type: "admin" }),
  createMockGroup({
    id: 1,
    name: "All internal users",
    magic_group_type: "all-internal-users",
  }),
];

type SetupOpts = {
  initialRoute?: string;
  databases?: Database[];
  settings?: Partial<EnterpriseSettings>;
};

const setup = async ({
  initialRoute = `/admin/permissions/data/group/${TEST_GROUPS[1].id}`,
  databases = [TEST_DATABASE],
  settings,
}: SetupOpts = {}) => {
  setupDatabasesEndpoints(databases);
  setupPermissionsGraphEndpoints(TEST_GROUPS, databases);
  setupGroupsEndpoint(TEST_GROUPS);

  fetchMock.get(
    `path:/api/database/${TEST_DATABASE.id}/metadata`,
    TEST_DATABASE,
  );

  const mockEventListener = jest.spyOn(window, "addEventListener");

  renderWithProviders(
    <Route path="/admin/permissions/data" element={<DataPermissionsPage />}>
      {/*
       * v7 cannot parse v3 optional groups, so the app spells each depth out as
       * its own route (see GROUPS_PERMISSIONS_PATHS in permissions/routes.tsx).
       * Mirror that here.
       */}
      {[
        "group",
        "group/:groupId",
        "group/:groupId/database/:databaseId",
        "group/:groupId/database/:databaseId/schema/:schemaName",
      ].map((path) => (
        <Route key={path} path={path} element={<GroupsPermissionsPage />}>
          {PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES}
        </Route>
      ))}
    </Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState:
        settings != null
          ? createMockState({ settings: mockSettings(settings) })
          : undefined,
    },
  );

  await waitForLoaderToBeRemoved();

  return { mockEventListener };
};

const editDatabasePermission = async () => {
  const permissionsSelectElem = (
    await screen.findAllByTestId("permissions-select")
  )[NATIVE_QUERIES_PERMISSION_INDEX];
  await userEvent.click(permissionsSelectElem);

  const clickElement = await screen.findByLabelText(/close icon/);
  await userEvent.click(clickElement);

  await delay(0);
};

describe("GroupsPermissionsPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("rendering", () => {
    it("should prompt to pick a group when none is selected", async () => {
      await setup({ initialRoute: "/admin/permissions/data/group" });

      expect(
        await screen.findByText("Select a group to see its data permissions"),
      ).toBeVisible();
    });

    it("should show 'Cancel' and 'Save Changes' when user makes changes to permissions", async () => {
      await setup();

      await editDatabasePermission();

      expect(screen.getByText("Cancel")).toBeInTheDocument();
      expect(screen.getByText("Save changes")).toBeInTheDocument();
    });
  });

  describe("triggering beforeunload events", () => {
    it("should generate beforeunload event when user edits database permissions", async () => {
      const { mockEventListener } = await setup();

      await editDatabasePermission();

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.returnValue).toBe(getBeforeUnloadUnsavedMessage());
    });

    it("should not have beforeunload event when permissions are unedited", async function () {
      const { mockEventListener } = await setup();
      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockEvent.returnValue).toBe(undefined);
    });
  });

  describe("transforms permission column", () => {
    afterEach(() => {
      reinitialize();
    });

    async function expectDatabaseNameColumn() {
      expect(
        await screen.findByRole("columnheader", { name: "Database name" }),
      ).toBeInTheDocument();
    }

    it("does not show the Transforms column in OSS, even with transforms enabled", async () => {
      await setup({
        settings: {
          "transforms-enabled": true,
          "token-features": createMockTokenFeatures(),
        },
      });

      await expectDatabaseNameColumn();
      expect(
        screen.queryByRole("columnheader", { name: /Transforms/ }),
      ).not.toBeInTheDocument();
    });

    it.each([
      { transformsEnabled: false, showsColumn: false },
      { transformsEnabled: true, showsColumn: true },
    ])(
      "shows the Transforms column in pro self-hosted only when transforms are enabled (enabled: $transformsEnabled)",
      async ({ transformsEnabled, showsColumn }) => {
        const tokenFeatures = createMockTokenFeatures({
          advanced_permissions: true,
          "transforms-basic": true,
        });
        mockSettings({ "token-features": tokenFeatures });
        setupEnterpriseOnlyPlugin("feature_level_permissions");

        await setup({
          settings: {
            "transforms-enabled": transformsEnabled,
            "token-features": tokenFeatures,
          },
        });

        await expectDatabaseNameColumn();
        expect(
          screen.getByRole("columnheader", { name: /Manage database/ }),
        ).toBeInTheDocument();
        expect(
          screen.queryAllByRole("columnheader", { name: /Transforms/ }),
        ).toHaveLength(showsColumn ? 1 : 0);
      },
    );
  });

  // Initializing the plugin is global for this file, so this block runs last
  describe("instance analytics database (metabase#44856)", () => {
    const AUDIT_DATABASE = createMockDatabase({
      id: 13371337,
      name: "Internal Metabase database",
      is_audit: true,
    });

    beforeEach(() => {
      mockSettings({
        "token-features": createMockTokenFeatures({ audit_app: true }),
      });
      setupEnterpriseOnlyPlugin("audit_app");
    });

    it("does not list the instance analytics database in a group's permissions", async () => {
      await setup({
        initialRoute: `/admin/permissions/data/group/${TEST_GROUPS[0].id}`,
        databases: [AUDIT_DATABASE, TEST_DATABASE],
      });

      const table = await screen.findByTestId("permission-table");
      expect(within(table).getByText(TEST_DATABASE.name)).toBeInTheDocument();
      expect(
        within(table).queryByText(AUDIT_DATABASE.name),
      ).not.toBeInTheDocument();
    });
  });
});
