import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { Route } from "metabase/router";
import type {
  DataApp,
  DataAppGroup,
  DataAppGroupPermissionWarning,
} from "metabase-types/api";
import { createMockDataApp, createMockGroup } from "metabase-types/api/mocks";

import { ManageDataAppGroupsPage } from "../ManageDataAppGroupsPage";

export const FINCHES_GROUP_ID = 3;
export const OWLS_GROUP_ID = 4;

const candidates = [
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

  createMockGroup({ id: FINCHES_GROUP_ID, name: "Finches" }),
  createMockGroup({ id: OWLS_GROUP_ID, name: "Owls" }),

  createMockGroup({
    id: 5,
    name: "Tenant",
    is_tenant_group: true,
  }),
];

export const setup = ({
  app = createMockDataApp(),
  groups = [],

  failFirstAdd = false,

  warnings = [],
  warningsError = false,
  warningsResponse,
}: {
  app?: DataApp;
  groups?: DataAppGroup[];

  failFirstAdd?: boolean;

  warnings?: DataAppGroupPermissionWarning[];
  warningsError?: boolean;
  warningsResponse?: Promise<DataAppGroupPermissionWarning[]>;
} = {}) => {
  let assigned = [...groups];

  fetchMock.get("path:/api/apps", [app]);
  fetchMock.get("path:/api/permissions/group", candidates);
  fetchMock.get("path:/api/apps/sales/groups", () => assigned);

  fetchMock.get(
    "path:/api/apps/sales",
    !app.enabled ? 404 : !app.resource_collection_id ? 409 : app,
  );

  fetchMock.get(
    "path:/api/apps/sales/group-permission-warnings",
    () =>
      warningsResponse ??
      (warningsError
        ? 500
        : warnings.filter((warning) =>
            assigned.some((group) => group.id === warning.group_id),
          )),
    { name: "data-app-group-permission-warnings" },
  );

  fetchMock.post("path:/api/apps/sales/groups", ({ options: { body } }) => {
    if (failFirstAdd) {
      failFirstAdd = false;
      return 500;
    }

    const { group_ids } = JSON.parse(String(body));

    assigned = [
      ...assigned,
      ...candidates
        .filter((group) => group_ids.includes(group.id))
        .map((group) => ({ ...group, member_count: 0 })),
    ];

    return assigned;
  });

  fetchMock.delete("express:/api/apps/sales/groups/:id", ({ url }) => {
    // `/api/apps/sales/groups/5` -> `5`
    const groupId = Number(url.split("/").pop());
    assigned = assigned.filter((group) => group.id !== groupId);

    return 204;
  });

  renderWithProviders(
    <Route
      path="admin/settings/apps/:slug/groups"
      element={
        <>
          <ManageDataAppGroupsPage />
          <UndoListing />
        </>
      }
    />,
    { withRouter: true, initialRoute: "/admin/settings/apps/sales/groups" },
  );
};

export async function openGroupAssignmentPicker() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Add groups" }),
  );

  await waitFor(() =>
    expect(
      screen.getByRole("textbox", { name: "Search for groups to add" }),
    ).toBeEnabled(),
  );

  await userEvent.click(
    screen.getByRole("textbox", { name: "Search for groups to add" }),
  );
}
