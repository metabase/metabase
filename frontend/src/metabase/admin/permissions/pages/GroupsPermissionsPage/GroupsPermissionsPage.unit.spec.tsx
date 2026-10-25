import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { callMockEvent } from "__support__/events";
import {
  setupDatabaseMetadataEndpoint,
  setupDatabasesEndpoints,
  setupGroupPermissionsGraphEndpointError,
  setupGroupsEndpoint,
  setupPermissionsGraphEndpoints,
  setupUpdatePermissionsGraphEndpoint,
  setupUpdatePermissionsGraphEndpointError,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { delay } from "__support__/utils";
import { getBeforeUnloadUnsavedMessage } from "metabase/common/hooks/use-before-unload";
import { PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES } from "metabase/plugins";
import { Route } from "metabase/router";
import { DataPermission, DataPermissionValue } from "metabase-types/api";
import { createMockPermissionsGraph } from "metabase-types/api/mocks";
import { createMockGroup } from "metabase-types/api/mocks/group";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { GROUPS_PERMISSIONS_PATHS } from "../../routes";
import { DataPermissionsPage } from "../DataPermissionsPage";

import { GroupsPermissionsPage } from "./GroupsPermissionsPage";
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
  saveErrorMessage?: string;
  graphErrorMessage?: string;
};

const setup = async ({
  initialRoute = `/admin/permissions/data/group/${TEST_GROUPS[1].id}`,
  saveErrorMessage,
  graphErrorMessage,
}: SetupOpts = {}) => {
  setupDatabasesEndpoints([TEST_DATABASE]);
  if (graphErrorMessage != null) {
    setupGroupPermissionsGraphEndpointError(
      TEST_GROUPS[1].id,
      graphErrorMessage,
    );
  }
  setupPermissionsGraphEndpoints(TEST_GROUPS, [TEST_DATABASE]);
  setupGroupsEndpoint(TEST_GROUPS);
  if (saveErrorMessage != null) {
    setupUpdatePermissionsGraphEndpointError(saveErrorMessage);
  } else {
    setupUpdatePermissionsGraphEndpoint({
      ...createMockPermissionsGraph({
        groups: TEST_GROUPS,
        databases: [TEST_DATABASE],
      }),
      revision: 2,
    });
  }

  setupDatabaseMetadataEndpoint(TEST_DATABASE);

  const mockEventListener = jest.spyOn(window, "addEventListener");

  renderWithProviders(
    <Route path="/admin/permissions/data" element={<DataPermissionsPage />}>
      {GROUPS_PERMISSIONS_PATHS.map((path) => (
        <Route key={path} path={path} element={<GroupsPermissionsPage />}>
          {PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES}
        </Route>
      ))}
    </Route>,
    {
      withRouter: true,
      initialRoute,
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

  it("shows the tables after drilling into a database", async () => {
    await setup({
      initialRoute: `/admin/permissions/data/group/${TEST_GROUPS[0].id}`,
    });
    const getRowCount = () =>
      within(screen.getByTestId("permission-table")).getAllByRole("row").length;

    await userEvent.click(await screen.findByText("Sample Database"));

    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(getRowCount()).toBe((TEST_DATABASE.tables ?? []).length + 1);
  });

  it("shows the error when a permission graph fails to load", async () => {
    await setup({ graphErrorMessage: "Graph is unavailable" });

    expect(await screen.findByText("Graph is unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });

  describe("saving", () => {
    const saveChanges = async () => {
      await userEvent.click(screen.getByText("Save changes"));
      await userEvent.click(await screen.findByRole("button", { name: "Yes" }));
    };

    const getSavedBody = (): unknown => {
      const call = fetchMock.callHistory.lastCall(
        "path:/api/permissions/graph",
        { method: "PUT" },
      );
      return typeof call?.options?.body === "string"
        ? JSON.parse(call.options.body)
        : undefined;
    };

    it("sends only the edited group and no drafts", async () => {
      await setup();
      await editDatabasePermission();
      await saveChanges();

      await waitFor(() =>
        expect(
          screen.queryByText("You've made changes to permissions."),
        ).not.toBeInTheDocument(),
      );
      expect(getSavedBody()).toEqual({
        revision: 1,
        groups: {
          [TEST_GROUPS[1].id]: {
            [TEST_DATABASE.id]: expect.objectContaining({
              [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
            }),
          },
        },
      });
    });

    it("does not report a revision change after its own save", async () => {
      await setup();
      await editDatabasePermission();
      await saveChanges();
      await waitFor(() =>
        expect(screen.queryByText("Save changes")).not.toBeInTheDocument(),
      );

      await userEvent.click(await screen.findByText("Administrators"));
      await userEvent.click(await screen.findByText("All internal users"));
      await editDatabasePermission();

      expect(await screen.findByText("Save changes")).toBeInTheDocument();
      expect(
        screen.queryByText("Someone just changed permissions"),
      ).not.toBeInTheDocument();
    });

    it("shows the error and keeps the changes when saving fails", async () => {
      await setup({ saveErrorMessage: "Revision is stale" });
      await editDatabasePermission();
      await saveChanges();

      expect(
        await screen.findByText("There was an error saving"),
      ).toBeInTheDocument();
      expect(screen.getByText("Revision is stale")).toBeInTheDocument();
      expect(
        screen.getByText("You've made changes to permissions."),
      ).toBeInTheDocument();
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
});
