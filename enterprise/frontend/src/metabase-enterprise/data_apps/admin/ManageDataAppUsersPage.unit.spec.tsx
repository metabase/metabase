import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import type { Group, Member } from "metabase-types/api";
import {
  createMockDataApp,
  createMockGroup,
  createMockUser,
} from "metabase-types/api/mocks";

import { ManageDataAppUsersPage } from "./ManageDataAppUsersPage";

const createMockMember = (opts?: Partial<Member>): Member => ({
  user_id: 1,
  group_id: 9,
  membership_id: 10,
  email: "existing@example.com",
  first_name: "Existing",
  last_name: "User",
  is_group_manager: false,
  is_superuser: false,
  ...opts,
});

const setup = ({ warningRequestFails = false } = {}) => {
  const group: Group = {
    ...createMockGroup({ id: 9, name: "Data App: sales" }),
    members: [createMockMember()],
  };
  const candidate = createMockUser({
    id: 2,
    first_name: "Pending",
    last_name: "User",
    email: "pending@example.com",
  });
  const deactivatedCandidate = createMockUser({
    id: 3,
    first_name: "Deactivated",
    last_name: "User",
    is_active: false,
  });
  const tenantCandidate = createMockUser({
    id: 4,
    first_name: "Tenant",
    last_name: "User",
    tenant_id: 12,
  });

  fetchMock.get(
    "path:/api/apps/sales",
    createMockDataApp({ permission_group_id: 9 }),
  );
  fetchMock.get("path:/api/permissions/group/9", group);
  fetchMock.get("path:/api/user", {
    data: [candidate, deactivatedCandidate, tenantCandidate],
    total: 3,
  });
  fetchMock.post(
    "path:/api/apps/sales/user-permission-warnings",
    warningRequestFails
      ? 500
      : {
          body: [
            {
              user_id: 1,
              missing_tables: [
                {
                  id: 8,
                  name: "Orders",
                  schema: "PUBLIC",
                  database_id: 2,
                  database_name: "Sample Database",
                },
              ],
            },
            {
              user_id: 2,
              missing_tables: [
                {
                  id: 8,
                  name: "Orders",
                  schema: "PUBLIC",
                  database_id: 2,
                  database_name: "Sample Database",
                },
              ],
            },
          ],
        },
  );

  renderWithProviders(
    <Route
      path="admin/settings/apps/:slug/users"
      element={<ManageDataAppUsersPage />}
    />,
    {
      withRouter: true,
      initialRoute: "/admin/settings/apps/sales/users",
    },
  );
};

describe("ManageDataAppUsersPage", () => {
  it("shows missing table access for an existing user", async () => {
    setup();

    expect(
      await screen.findByText("Manage users for Sales"),
    ).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: "Missing access to 1 table" }),
    );

    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review data permissions" }),
    ).toHaveAttribute("href", "/admin/permissions/data");
  });

  it("shows a warning for a pending user and still submits the membership", async () => {
    fetchMock.post("path:/api/permissions/membership", 204);
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Add users" }),
    );
    await userEvent.click(await screen.findByText("Pending User"));

    expect(
      await screen.findAllByText("Missing access to 1 table"),
    ).not.toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/permissions/membership", {
          method: "POST",
          body: { group_id: 9, user_id: 2 },
        }),
      ).toBe(true);
    });
  });

  it("only offers active internal users to add", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Add users" }),
    );

    expect(await screen.findByText("Pending User")).toBeInTheDocument();
    expect(screen.queryByText("Deactivated User")).not.toBeInTheDocument();
    expect(screen.queryByText("Tenant User")).not.toBeInTheDocument();
  });

  it("keeps adding enabled when warning checks fail", async () => {
    fetchMock.post("path:/api/permissions/membership", 204);
    setup({ warningRequestFails: true });

    await userEvent.click(
      await screen.findByRole("button", { name: "Add users" }),
    );
    await userEvent.click(await screen.findByText("Pending User"));

    expect(
      await screen.findByText(/couldn't check data access/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
