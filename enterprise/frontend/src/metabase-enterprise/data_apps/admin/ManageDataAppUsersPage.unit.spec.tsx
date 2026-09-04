import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, within } from "__support__/ui";
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
}: {
  warningRequestFails?: boolean;
} = {}) => {
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
  it("links back to data apps and shows the app name in the breadcrumb", async () => {
    setup();

    const breadcrumb = await screen.findByTestId("breadcrumbs");

    const dataAppsLink = within(breadcrumb).getByRole("link", {
      name: "Data apps",
    });

    expect(dataAppsLink).toHaveAttribute("href", "/admin/settings/apps");
    expect(within(breadcrumb).getByText("Sales")).toBeInTheDocument();
  });

  it("does not check data access for users before adding them", async () => {
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

    await userEvent.click(await screen.findByText("Pending User"));

    expect(
      fetchMock.callHistory.calls(
        "path:/api/apps/sales/user-permission-warnings",
      ),
    ).toHaveLength(1);
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
