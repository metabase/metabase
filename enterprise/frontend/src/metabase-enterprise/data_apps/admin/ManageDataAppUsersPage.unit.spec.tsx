import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
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

const setup = ({
  warningRequestFails = false,
  members = [createMockMember()],
}: {
  warningRequestFails?: boolean;
  members?: Member[];
} = {}) => {
  const group: Group = {
    ...createMockGroup({ id: 9, name: "Data App: sales" }),
    members,
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

  const anotherCandidate = createMockUser({
    id: 5,
    first_name: "Another",
    last_name: "User",
    email: "another.user@example.com",
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
    data: [candidate, anotherCandidate, deactivatedCandidate, tenantCandidate],
    total: 4,
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
  it("shows the app name in the breadcrumb above the management page", async () => {
    setup();

    const breadcrumb = await screen.findByTestId("breadcrumbs");
    const dataAppsLink = within(breadcrumb).getByRole("link", {
      name: "Data apps",
    });
    const panel = screen.getByTestId("admin-panel");

    expect(dataAppsLink).toHaveAttribute("href", "/admin/settings/apps");
    expect(within(breadcrumb).getByText("Sales")).toBeInTheDocument();
    expect(panel).not.toContainElement(breadcrumb);
    expect(
      screen.getByRole("heading", { name: "Manage access to this app" }),
    ).toBeInTheDocument();
  });

  it("shows an illustrated empty state when no one has access", async () => {
    setup({ members: [] });

    const emptyState = await screen.findByTestId("data-app-users-empty-state");

    expect(
      within(emptyState).getByText("No one has access yet"),
    ).toBeInTheDocument();

    expect(
      within(emptyState).getByTestId("data-app-users-empty-state-icon"),
    ).toBeVisible();
  });

  it("shows missing table access for an existing user", async () => {
    setup();

    expect(
      await screen.findByText("Manage access to this app"),
    ).toBeInTheDocument();

    const rowActions = await screen.findByTestId("data-app-user-actions");

    const warningButton = await within(rowActions).findByRole("button", {
      name: "Missing data access",
    });

    expect(
      within(rowActions).getByRole("button", { name: "Remove Existing User" }),
    ).toBeInTheDocument();

    await userEvent.hover(warningButton);

    const popover = await screen.findByTestId("data-access-warning-popover");

    expect(
      within(popover).getByText(
        "Existing doesn’t have permission to view these tables used in this app:",
      ),
    ).toBeInTheDocument();
    const missingTables = screen.getByTestId("missing-tables-list");

    const databaseLink = within(missingTables).getByRole("link", {
      name: "Sample Database",
    });

    const schemaLink = within(missingTables).getByRole("link", {
      name: "PUBLIC",
    });

    const tableLink = within(missingTables).getByRole("link", {
      name: "Orders",
    });

    expect(databaseLink).toHaveAttribute(
      "href",
      "/admin/permissions/data/database/2",
    );

    expect(schemaLink).toHaveAttribute(
      "href",
      "/admin/permissions/data/database/2/schema/PUBLIC",
    );

    expect(tableLink).toHaveAttribute(
      "href",
      "/admin/permissions/data/database/2/schema/PUBLIC/table/8",
    );

    for (const link of [databaseLink, schemaLink, tableLink]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }

    expect(
      screen.queryByRole("link", { name: "Review data permissions" }),
    ).not.toBeInTheDocument();
  });

  it("only shows a data access badge for users with missing access", async () => {
    setup({
      members: [
        createMockMember({
          user_id: 6,
          email: "covered@example.com",
          first_name: "Covered",
          last_name: "User",
        }),
      ],
    });

    expect(await screen.findByText("Covered User")).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Missing data access" }),
    ).not.toBeInTheDocument();
  });

  it("adds selected users without checking data access before save", async () => {
    fetchMock.post("path:/api/permissions/membership", 204);
    setup();

    expect(
      await screen.findByRole("button", { name: "Missing data access" }),
    ).toBeInTheDocument();

    expect(
      fetchMock.callHistory.calls(
        "path:/api/apps/sales/user-permission-warnings",
      ),
    ).toHaveLength(1);

    await userEvent.click(
      await screen.findByRole("button", { name: "Add users" }),
    );
    expect(await screen.findByText("Another User")).toBeInTheDocument();
    await userEvent.click(await screen.findByText("Pending User"));

    await waitFor(() => {
      expect(screen.queryByText("Another User")).not.toBeInTheDocument();
    });

    const searchInput = screen.getByRole("textbox", {
      name: "Search for a user to add",
    });

    expect(searchInput).toHaveAttribute(
      "placeholder",
      "Pick someone from the list, or paste a list of email addresses separated by commas",
    );

    await userEvent.type(searchInput, "Another");
    await userEvent.click(await screen.findByText("Another User"));

    const currentUsersTable = screen.getByTestId("admin-content-table");
    const usersCard = screen.getByTestId("data-app-users-card");

    expect(usersCard).toContainElement(searchInput);
    expect(usersCard).toContainElement(currentUsersTable);
    expect(screen.queryByRole("columnheader")).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(
        "path:/api/apps/sales/user-permission-warnings",
      ),
    ).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/permissions/membership", {
          method: "POST",
          body: { group_id: 9, user_id: 2 },
        }),
      ).toBe(true);
    });
  });

  it("adds users pasted as comma-separated email addresses", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Add users" }),
    );

    const searchInput = screen.getByRole("textbox", {
      name: "Search for a user to add",
    });

    await userEvent.click(searchInput);
    await userEvent.paste("pending@example.com, another.user@example.com");

    expect(await screen.findByText("Pending User")).toBeInTheDocument();
    expect(await screen.findByText("Another User")).toBeInTheDocument();
  });

  it("does not show the current users table while adding to an empty app", async () => {
    setup({ members: [] });

    await userEvent.click(
      await screen.findByRole("button", { name: "Add users" }),
    );

    expect(
      screen.getByRole("textbox", { name: "Search for a user to add" }),
    ).toBeInTheDocument();

    expect(screen.queryByTestId("admin-content-table")).not.toBeInTheDocument();
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

  it("keeps adding enabled when the existing-user warning check fails", async () => {
    fetchMock.post("path:/api/permissions/membership", 204);
    setup({ warningRequestFails: true });

    await userEvent.click(
      await screen.findByRole("button", { name: "Add users" }),
    );

    await userEvent.click(await screen.findByText("Pending User"));

    expect(
      (await screen.findAllByText(/couldn't check data access/i)).length,
    ).toBeGreaterThan(0);

    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
  });
});
