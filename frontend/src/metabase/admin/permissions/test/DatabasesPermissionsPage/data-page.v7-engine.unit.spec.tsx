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
} from "__support__/ui";
import DataPermissionsPage from "metabase/admin/permissions/pages/DataPermissionsPage/DataPermissionsPage";
import { DatabasesPermissionsPage } from "metabase/admin/permissions/pages/DatabasePermissionsPage/DatabasesPermissionsPage";
import { Route, withRouteProps } from "metabase/router";
import { createMockGroup } from "metabase-types/api/mocks/group";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

/**
 * End-to-end proof that a real, router-heavy page renders on the v7 engine. The
 * data-permissions page mounts `LeaveRouteConfirmModal`, which used v3's
 * `withRouter` and crashed on v7 with `router === undefined` until that HOC was
 * removed. Rendering the whole page under `routerEngine: "v7"` exercises the
 * bridge, the leave-confirmation flow, and `withRouteProps` together.
 */

const RoutedDataPermissionsPage = withRouteProps(DataPermissionsPage);
const RoutedDatabasesPermissionsPage = withRouteProps(DatabasesPermissionsPage);

const TEST_DATABASE = createSampleDatabase();
const TEST_GROUPS = [
  createMockGroup({
    id: 1,
    name: "All internal users",
    magic_group_type: "all-internal-users",
  }),
  createMockGroup({ id: 2, name: "Administrators", magic_group_type: "admin" }),
];

function setup() {
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupPermissionsGraphEndpoints(TEST_GROUPS, [TEST_DATABASE]);
  setupGroupsEndpoint(TEST_GROUPS);
  fetchMock.get(
    `path:/api/database/${TEST_DATABASE.id}/metadata`,
    TEST_DATABASE,
  );

  renderWithProviders(
    <Route
      path="/admin/permissions/data"
      element={<RoutedDataPermissionsPage />}
    >
      <Route
        path="database/:databaseId"
        element={<RoutedDatabasesPermissionsPage />}
      />
    </Route>,
    {
      withRouter: true,
      routerEngine: "v7",
      initialRoute: `/admin/permissions/data/database/${TEST_DATABASE.id}`,
    },
  );
}

describe("real page on the v7 engine", () => {
  it("renders the data-permissions page (LeaveRouteConfirmModal + bridge)", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(
      await screen.findByRole("row", { name: /All internal users/i }),
    ).toBeInTheDocument();
  });
});
