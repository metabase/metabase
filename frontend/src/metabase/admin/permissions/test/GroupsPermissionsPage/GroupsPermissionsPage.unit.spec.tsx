import React from "react";
import { Route } from "react-router";
import fetchMock from "fetch-mock";
import {
  renderWithProviders,
  waitForElementToBeRemoved,
  screen,
  fireEvent,
} from "__support__/ui";
import DataPermissionsPage from "metabase/admin/permissions/pages/DataPermissionsPage/DataPermissionsPage";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockPermissionsGraph } from "metabase-types/api/mocks/permissions";
import { createMockGroup } from "metabase-types/api/mocks/group";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { setupPermissionsGraphEndpoint } from "__support__/server-mocks/permissions";
import { setupGroupsEndpoint } from "__support__/server-mocks/group";
import { PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES } from "metabase/plugins";
import GroupsPermissionsPage from "metabase/admin/permissions/pages/GroupDataPermissionsPage/GroupsPermissionsPage";
import { delay } from "metabase/lib/promise";
import { callMockEvent } from "__support__/events";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";

const TEST_DATABASE = createSampleDatabase();

const TEST_GROUPS = [
  createMockGroup({ id: 2, name: "Administrators" }),
  createMockGroup({ name: "All Users" }),
];

const TEST_PERMISSIONS_GRAPH = createMockPermissionsGraph({
  groups: TEST_GROUPS,
  databases: [TEST_DATABASE],
});

const setup = async () => {
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupPermissionsGraphEndpoint(TEST_PERMISSIONS_GRAPH);
  setupGroupsEndpoint(TEST_GROUPS);

  fetchMock.get(
    `path:/api/database/${TEST_DATABASE.id}/metadata`,
    TEST_DATABASE,
  );

  const mockEventListener = jest.spyOn(window, "addEventListener");

  renderWithProviders(
    <Route path="/admin/permissions/data" component={DataPermissionsPage}>
      <Route
        path="group(/:groupId)(/database/:databaseId)(/schema/:schemaName)"
        component={GroupsPermissionsPage}
      >
        {PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES}
      </Route>
    </Route>,
    {
      withRouter: true,
      initialRoute: `/admin/permissions/data/group/${TEST_DATABASE.id}`,
    },
  );

  await waitForElementToBeRemoved(() =>
    screen.queryByTestId("loading-spinner"),
  );

  return { mockEventListener };
};

const editDatabasePermission = async () => {
  const permissionsSelectElem = screen.getAllByTestId("permissions-select")[0];
  fireEvent.click(permissionsSelectElem);

  const clickElement = screen.getByLabelText("eye icon");
  fireEvent.click(clickElement);

  await delay(0);
};

describe("GroupsPermissionsPage", function () {
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
