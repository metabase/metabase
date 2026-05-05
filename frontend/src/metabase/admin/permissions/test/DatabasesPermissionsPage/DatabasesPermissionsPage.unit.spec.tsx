import { userEvent } from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { callMockEvent } from "__support__/events";
import {
  setupDatabasesEndpoints,
  setupGroupsEndpoint,
  setupPermissionsGraphEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { delay } from "__support__/utils";
import DataPermissionsPage from "metabase/admin/permissions/pages/DataPermissionsPage/DataPermissionsPage";
import { DatabasesPermissionsPage } from "metabase/admin/permissions/pages/DatabasePermissionsPage/DatabasesPermissionsPage";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/common/hooks/use-before-unload";
import { PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES } from "metabase/plugins";
import { createMockGroup } from "metabase-types/api/mocks/group";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

const TEST_DATABASE = createSampleDatabase();

const TEST_GROUPS = [
  createMockGroup({
    id: 1,
    name: "All internal users",
    magic_group_type: "all-internal-users",
  }),
  createMockGroup({ id: 2, name: "Administrators", magic_group_type: "admin" }),
];

const setup = async () => {
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupPermissionsGraphEndpoints(TEST_GROUPS, [TEST_DATABASE]);
  setupGroupsEndpoint(TEST_GROUPS);

  fetchMock.get(
    `path:/api/database/${TEST_DATABASE.id}/metadata`,
    TEST_DATABASE,
  );

  const mockEventListener = jest.spyOn(window, "addEventListener");

  renderWithProviders(
    <Route path="/admin/permissions/data" component={DataPermissionsPage}>
      <Route
        path="database(/:databaseId)(/schema/:schemaName)(/table/:tableId)"
        component={DatabasesPermissionsPage}
      >
        {PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES}
      </Route>
    </Route>,
    {
      withRouter: true,
      initialRoute: `/admin/permissions/data/database/${TEST_DATABASE.id}`,
    },
  );

  await waitForLoaderToBeRemoved();

  return { mockEventListener };
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
      expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
    });

    it("should not have beforeunload event when permissions are unedited", async function () {
      const { mockEventListener } = await setup();
      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockEvent.returnValue).toBe(undefined);
    });
  });
});
