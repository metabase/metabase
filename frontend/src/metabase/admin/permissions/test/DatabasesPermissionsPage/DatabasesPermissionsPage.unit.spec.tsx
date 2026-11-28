import { userEvent } from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { callMockEvent } from "__support__/events";
import {
  setupDatabasesEndpoints,
  setupGroupsEndpoint,
  setupPermissionsGraphEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { delay } from "__support__/utils";
import { DataPermissionsPage } from "metabase/admin/permissions/pages/DataPermissionsPage/DataPermissionsPage";
import { DatabasesPermissionsPage } from "metabase/admin/permissions/pages/DatabasePermissionsPage/DatabasesPermissionsPage";
import { getBeforeUnloadUnsavedMessage } from "metabase/common/hooks/use-before-unload";
import { PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES } from "metabase/plugins";
import { Route } from "metabase/router";
import { setLocalization } from "metabase/utils/i18n";
import { defer } from "metabase/utils/promise";
import type { Database, Group } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockGroup } from "metabase-types/api/mocks/group";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { ROUTED_DATABASE } from "../routed-database";
const TEST_DATABASE = createSampleDatabase();

const TEST_GROUPS = [
  createMockGroup({
    id: 1,
    name: "All internal users",
    magic_group_type: "all-internal-users",
  }),
  createMockGroup({ id: 2, name: "Administrators", magic_group_type: "admin" }),
];

interface SetupOpts {
  shouldWaitForLoader?: boolean;
  showUpdatedPermissionModal?: boolean;
  deferDatabaseMetadata?: boolean;
  databases?: Database[];
  initialRoute?: string;
  groups?: Omit<Group, "members">[];
}

const setup = async ({
  shouldWaitForLoader = true,
  showUpdatedPermissionModal = false,
  deferDatabaseMetadata = false,
  databases = [TEST_DATABASE],
  initialRoute = `/admin/permissions/data/database/${databases[0].id}`,
  groups = TEST_GROUPS,
}: SetupOpts = {}) => {
  setupDatabasesEndpoints(databases);
  setupPermissionsGraphEndpoints(groups, databases);
  setupGroupsEndpoint(groups);

  const databaseMetadata = defer<Database>();

  // GET /api/database/:id/metadata does not return router_user_attribute
  databases.forEach((database) => {
    fetchMock.get(
      `path:/api/database/${database.id}/metadata`,
      deferDatabaseMetadata
        ? () => databaseMetadata.promise
        : { ...database, router_user_attribute: undefined },
    );
  });

  const mockEventListener = jest.spyOn(window, "addEventListener");

  renderWithProviders(
    <Route path="/admin/permissions/data" element={<DataPermissionsPage />}>
      {/*
       * v7 cannot parse v3 optional groups, so the app spells each depth out as
       * its own route (see DATABASES_PERMISSIONS_PATHS in permissions/routes.tsx).
       * Mirror that here.
       */}
      {[
        "database",
        "database/:databaseId",
        "database/:databaseId/schema/:schemaName",
        "database/:databaseId/schema/:schemaName/table/:tableId",
      ].map((path) => (
        <Route key={path} path={path} element={<DatabasesPermissionsPage />}>
          {PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES}
        </Route>
      ))}
    </Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: {
        settings: mockSettings({
          "show-updated-permission-modal": showUpdatedPermissionModal,
        }),
      },
    },
  );

  if (shouldWaitForLoader) {
    await waitForLoaderToBeRemoved();
  } else {
    // The page is still loading on purpose here, so there is nothing to wait
    // on. Flush the updates it is about to make, which the caller cannot do
    // once this has returned.
    await waitFor(() => {});
  }

  return { mockEventListener, databaseMetadata };
};

const editDatabasePermission = async () => {
  const row = await screen.findByRole("row", { name: /All internal users/i });
  const permissionSelect = within(row).getAllByTestId("permissions-select")[0];
  await userEvent.click(permissionSelect);

  const clickElement = screen.getByLabelText(/close icon/);
  await userEvent.click(clickElement);

  await delay(0);
};

describe("DatabasesPermissionsPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("rendering", () => {
    it("should keep the permissions tabs visible while data is loading", async () => {
      await setup({ shouldWaitForLoader: false });

      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Data" })).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "Collections" }),
      ).toBeInTheDocument();
    });

    it("should open the split permissions modal only after data has loaded", async () => {
      const { databaseMetadata } = await setup({
        shouldWaitForLoader: false,
        showUpdatedPermissionModal: true,
        deferDatabaseMetadata: true,
      });

      await delay(0);
      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      databaseMetadata.resolve(TEST_DATABASE);

      await waitForLoaderToBeRemoved();
      expect(
        await screen.findByRole("dialog", {
          name: "Your data permissions may look different, but the access hasn’t changed.",
        }),
      ).toBeInTheDocument();
    });

    it("should show 'Cancel' and 'Save Changes' when user makes changes to permissions", async () => {
      await setup();

      await editDatabasePermission();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
      expect(screen.getByText("Save changes")).toBeInTheDocument();
    });

    it("marks a database with routing enabled in the breadcrumbs", async () => {
      await setup({
        databases: [TEST_DATABASE, ROUTED_DATABASE],
        initialRoute: `/admin/permissions/data/database/${ROUTED_DATABASE.id}`,
      });

      expect(
        within(screen.getByTestId("permissions-editor-breadcrumbs")).getByText(
          "(Database routing enabled)",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("in a non-default locale (metabase#33035)", () => {
    // The special groups keep their English names in the app DB; the UI
    // translates them. Anything that identifies a group by its displayed name
    // breaks once these differ.
    const SPECIAL_GROUPS = [
      createMockGroup({
        id: 1,
        name: "All Users",
        magic_group_type: "all-internal-users",
      }),
      createMockGroup({
        id: 2,
        name: "Administrators",
        magic_group_type: "admin",
      }),
      createMockGroup({ id: 3, name: "Marketing" }),
    ];

    const DE_LOCALE = {
      headers: {
        language: "de",
        "plural-forms": "nplurals=2; plural=(n != 1);",
      },
      translations: {
        "": {
          "All Users": { msgstr: ["Alle Benutzer"] },
          Administrators: { msgstr: ["Administratoren"] },
          "Group name": { msgstr: ["Gruppenname"] },
        },
      },
    };

    const EN_LOCALE = {
      headers: {
        language: "en",
        "plural-forms": "nplurals=2; plural=(n != 1);",
      },
      translations: { "": {} },
    };

    afterEach(() => {
      setLocalization(EN_LOCALE);
    });

    it.each([
      { language: "en", locale: EN_LOCALE, groupNameHeader: "Group name" },
      { language: "de", locale: DE_LOCALE, groupNameHeader: "Gruppenname" },
    ])(
      "renders the database permissions page in $language",
      async ({ locale, groupNameHeader }) => {
        setLocalization(locale);
        await setup({ groups: SPECIAL_GROUPS });

        expect(
          await screen.findByRole("columnheader", { name: groupNameHeader }),
        ).toBeInTheDocument();
        expect(await screen.findByText("Orders")).toBeInTheDocument();
        expect(
          screen.getByRole("row", { name: /Marketing/ }),
        ).toBeInTheDocument();
      },
    );
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

    it("does not list the instance analytics database in the databases sidebar", async () => {
      await setup({
        initialRoute: "/admin/permissions/data/database",
        databases: [AUDIT_DATABASE, TEST_DATABASE],
      });

      const sidebar = await screen.findByRole("complementary");
      expect(
        await within(sidebar).findByText(TEST_DATABASE.name),
      ).toBeInTheDocument();
      expect(
        within(sidebar).queryByText(AUDIT_DATABASE.name),
      ).not.toBeInTheDocument();
    });
  });
});
