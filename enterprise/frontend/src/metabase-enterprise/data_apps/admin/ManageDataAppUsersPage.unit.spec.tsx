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
  it("places the Data apps back link above the management card", async () => {
    setup();

    const backLink = await screen.findByRole("link", { name: /Data apps/ });
    const card = screen.getByTestId("data-app-users-card");

    expect(card).not.toContainElement(backLink);
    expect(card).toContainElement(screen.getByTestId("admin-panel"));
  });

  it("shows missing table access for an existing user", async () => {
    setup();

    expect(
      await screen.findByText("Manage users for Sales"),
    ).toBeInTheDocument();
    await userEvent.hover(
      await screen.findByRole("button", { name: "Missing access to 1 table" }),
    );

    const popover = await screen.findByTestId("data-access-warning-popover");

    expect(popover).toHaveStyle({ padding: "var(--mantine-spacing-md)" });
    expect(screen.getByText("Missing data access")).toBeInTheDocument();
    expect(await screen.findByText("Orders")).toBeInTheDocument();
    const missingTables = screen.getByTestId("missing-tables-list");
    const reviewLink = screen.getByRole("link", {
      name: "Review data permissions",
    });

    expect(missingTables).toHaveStyle({ paddingLeft: "0rem" });
    expect(
      within(missingTables).getByTestId("missing-table-icon"),
    ).toBeVisible();
    expect(reviewLink).toHaveAttribute(
      "href",
      "/admin/permissions/data/group/9",
    );
    expect(reviewLink).toHaveAttribute("data-variant", "outline");
    expect(reviewLink).toHaveAttribute("data-size", "compact-sm");
    expect(reviewLink).toHaveStyle({ width: "fit-content" });
  });

  it("shows a minimal status when an existing user has adequate access", async () => {
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

    const label =
      "Has view or sandboxed access to every table used by this app.";
    const status = await screen.findByLabelText(label);

    expect(status).toHaveClass("Icon-check");

    await userEvent.hover(status);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(label);
  });

  it("shows a warning for a pending user and still submits the membership", async () => {
    fetchMock.post("path:/api/permissions/membership", 204);
    setup();

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

    await userEvent.type(searchInput, "Another");
    await userEvent.click(await screen.findByText("Another User"));

    const missingAccessUsers = screen.getByTestId("missing-data-access-users");
    const currentUsersTable = screen.getByTestId("admin-content-table");
    const sections = screen.getByTestId("user-management-sections");

    expect(sections).toHaveStyle("--stack-gap: var(--mantine-spacing-lg)");
    expect(screen.getByText("Current users")).toBeInTheDocument();
    expect(currentUsersTable).not.toContainElement(searchInput);
    expect(currentUsersTable).not.toContainElement(missingAccessUsers);
    expect(
      within(missingAccessUsers).getByText("Users missing data access"),
    ).toBeInTheDocument();
    expect(
      within(missingAccessUsers).getByText("Pending User"),
    ).toBeInTheDocument();
    expect(
      within(missingAccessUsers).queryByText("Another User"),
    ).not.toBeInTheDocument();
    expect(
      await within(missingAccessUsers).findByText("Missing access to 1 table"),
    ).toBeInTheDocument();

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

  it("does not show the current users table while adding to an empty app", async () => {
    setup({ members: [] });

    await userEvent.click(
      await screen.findByRole("button", { name: "Add users" }),
    );

    expect(
      screen.getByRole("textbox", { name: "Search for a user to add" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Current users")).not.toBeInTheDocument();
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
    expect(
      screen.queryByLabelText(
        "Has view or sandboxed access to every table used by this app.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
