import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

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
import DataPermissionsPage from "metabase/admin/permissions/pages/DataPermissionsPage/DataPermissionsPage";
import { GroupsPermissionsPage } from "metabase/admin/permissions/pages/GroupDataPermissionsPage/GroupsPermissionsPage";
import type { RouterEngine } from "metabase/router/engine";
import { Route, withRouteProps } from "metabase/router";
import { createMockGroup } from "metabase-types/api/mocks/group";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

const RoutedDataPermissionsPage = withRouteProps(DataPermissionsPage);
const RoutedGroupsPermissionsPage = withRouteProps(GroupsPermissionsPage);

const TEST_DATABASE = createSampleDatabase();

const TEST_GROUPS = [
  createMockGroup({ id: 2, name: "Administrators", magic_group_type: "admin" }),
  createMockGroup({
    id: 1,
    name: "All internal users",
    magic_group_type: "all-internal-users",
  }),
];

// The real routes.tsx enumerates each drill-down depth as its own sibling route
// because v7's matcher cannot parse v3's optional groups.
const GROUPS_PERMISSIONS_PATHS = [
  "group/:groupId",
  "group/:groupId/database/:databaseId",
  "group/:groupId/database/:databaseId/schema/:schemaName",
];

const setup = (routerEngine: RouterEngine) => {
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupPermissionsGraphEndpoints(TEST_GROUPS, [TEST_DATABASE]);
  setupGroupsEndpoint(TEST_GROUPS);

  fetchMock.get(
    `path:/api/database/${TEST_DATABASE.id}/metadata`,
    TEST_DATABASE,
  );

  return renderWithProviders(
    <Route
      path="/admin/permissions/data"
      element={<RoutedDataPermissionsPage />}
    >
      {GROUPS_PERMISSIONS_PATHS.map((path) => (
        <Route
          key={path}
          path={path}
          element={<RoutedGroupsPermissionsPage />}
        />
      ))}
    </Route>,
    {
      withRouter: true,
      routerEngine,
      initialRoute: `/admin/permissions/data/group/2`,
    },
  );
};

const tableRowCount = () =>
  within(screen.getByTestId("permission-table")).getAllByRole("row").length;

// Clicking a database name is a `<Link>` used as a button (onClick, no `to`).
// On v7 the engine-aware link must not perform its own navigation, or it clobbers
// the push the click handler dispatches and the drill-down never happens.
describe.each<RouterEngine>(["v3", "v7"])(
  "GroupsPermissionsPage drill-down on the %s engine",
  (routerEngine) => {
    it("shows the tables after drilling into a database", async () => {
      setup(routerEngine);
      await waitForLoaderToBeRemoved();

      // Database-level view: one row for Sample Database (plus header row).
      const dbRow = await screen.findByText("Sample Database");
      expect(tableRowCount()).toBe(2);

      await userEvent.click(dbRow);

      // Table-level view: a row per table in the sample database.
      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(tableRowCount()).toBe(TEST_DATABASE.tables.length + 1);
    });
  },
);
