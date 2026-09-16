import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { Route } from "metabase/router";
import type {
  DataAppGroup,
  DataAppGroupPermissionWarning,
} from "metabase-types/api";
import { createMockDataApp, createMockGroup } from "metabase-types/api/mocks";

import { ManageDataAppGroupsPage } from "./ManageDataAppGroupsPage";

const candidates = [
  createMockGroup({
    id: 1,
    name: "All Users",
    magic_group_type: "all-internal-users",
  }),
  createMockGroup({ id: 2, name: "Administrators", magic_group_type: "admin" }),
  createMockGroup({ id: 3, name: "Finches" }),
  createMockGroup({ id: 4, name: "Owls" }),
  createMockGroup({ id: 5, name: "Tenant", is_tenant_group: true }),
];

const setup = ({
  groups = [],
  failFirstAdd = false,
  warnings = [],
  warningsError = false,
}: {
  groups?: DataAppGroup[];
  failFirstAdd?: boolean;
  warnings?: DataAppGroupPermissionWarning[];
  warningsError?: boolean;
} = {}) => {
  let assigned = [...groups];
  fetchMock.get("path:/api/apps/sales", createMockDataApp());
  fetchMock.get("path:/api/apps/sales/groups", () => assigned);
  fetchMock.get("path:/api/permissions/group", candidates);
  fetchMock.get("path:/api/apps/sales/group-permission-warnings", () =>
    warningsError
      ? 500
      : warnings.filter((warning) =>
          assigned.some((group) => group.id === warning.group_id),
        ),
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
    assigned = assigned.filter(
      (group) => group.id !== Number(url.split("/").pop()),
    );
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

const openPicker = async () => {
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
};

describe("ManageDataAppGroupsPage", () => {
  const warning = {
    group_id: 3,
    missing_tables: [
      {
        id: 10,
        name: "Orders",
        schema: "public",
        database_id: 1,
        database_name: "Birds",
      },
    ],
  };

  it("shows missing tables for assigned groups on hover", async () => {
    setup({
      groups: [{ id: 3, name: "Finches", member_count: 0 }],
      warnings: [warning],
    });

    await userEvent.hover(
      await screen.findByRole("button", { name: "Missing data access" }),
    );

    expect(
      screen.getByRole("columnheader", { name: "Data access" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Finches doesn’t have permission to view these tables used in this app:",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute(
      "href",
      expect.stringContaining("/admin/permissions/data"),
    );

    await userEvent.hover(screen.getByRole("link", { name: "Orders" }));

    expect(screen.getByRole("link", { name: "Orders" })).toBeVisible();

    await userEvent.unhover(screen.getByRole("link", { name: "Orders" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Orders" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("leaves adequate groups unmarked and clears a removed group's warning", async () => {
    setup({
      groups: [
        { id: 3, name: "Finches", member_count: 0 },
        { id: 4, name: "Owls", member_count: 2 },
      ],
      warnings: [warning],
    });

    expect(
      await screen.findByRole("button", { name: "Missing data access" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("row", { name: /Owls/ })).queryByRole("button", {
        name: "Missing data access",
      }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Finches" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Missing data access" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Remove Owls" }),
    ).toBeInTheDocument();
  });

  it("checks access only after assigning the selected group", async () => {
    setup({ warnings: [warning] });
    await openPicker();
    await userEvent.click(screen.getByRole("option", { name: "Finches" }));

    expect(
      fetchMock.callHistory.called(
        "path:/api/apps/sales/group-permission-warnings",
      ),
    ).toBe(false);
    expect(
      screen.queryByRole("button", { name: "Missing data access" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Add", exact: true }),
    );

    expect(
      await screen.findByRole("button", { name: "Missing data access" }),
    ).toBeInTheDocument();
  });

  it("keeps removal available when the warning check fails", async () => {
    setup({
      groups: [{ id: 3, name: "Finches", member_count: 0 }],
      warningsError: true,
    });

    expect(
      await screen.findByText(
        "We couldn't check data access for assigned groups. You can still update access to this data app.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Finches" }),
    );

    expect(
      await screen.findByText("No groups have access yet"),
    ).toBeInTheDocument();
  });

  it("shows the empty state and filters ineligible and assigned groups", async () => {
    setup({ groups: [{ id: 4, name: "Owls", member_count: 7 }] });
    expect(
      await screen.findByText("Manage access to Sales"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Group name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Members" }),
    ).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();

    await openPicker();

    expect(
      screen.getByRole("option", { name: "All Users" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Finches" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Owls" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Administrators" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Tenant" }),
    ).not.toBeInTheDocument();
  });

  it("submits selected groups in a single atomic batch", async () => {
    setup();
    expect(
      await screen.findByText("No groups have access yet"),
    ).toBeInTheDocument();
    await openPicker();
    await userEvent.click(screen.getByRole("option", { name: "Finches" }));
    await userEvent.click(screen.getByRole("option", { name: "Owls" }));

    await userEvent.click(
      screen.getByRole("button", { name: "Add", exact: true }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("path:/api/apps/sales/groups", {
          method: "POST",
        }),
      ).toHaveLength(1),
    );
    expect(
      JSON.parse(
        String(
          fetchMock.callHistory.lastCall("path:/api/apps/sales/groups", {
            method: "POST",
          })?.options.body,
        ),
      ),
    ).toEqual({ group_ids: [3, 4] });
    expect(
      await screen.findByRole("button", { name: "Remove Finches" }),
    ).toBeInTheDocument();
  });

  it("removes an assignment immediately", async () => {
    setup({ groups: [{ id: 3, name: "Finches", member_count: 0 }] });
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove Finches" }),
    );

    expect(
      await screen.findByText("No groups have access yet"),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.called("path:/api/apps/sales/groups/3", {
        method: "DELETE",
      }),
    ).toBe(true);
  });
  it("keeps the entire selection for an atomic add retry", async () => {
    setup({ failFirstAdd: true });
    await openPicker();
    await userEvent.click(screen.getByRole("option", { name: "Finches" }));
    await userEvent.click(screen.getByRole("option", { name: "Owls" }));
    const add = () =>
      within(screen.getByTestId("data-app-groups-card")).getByRole("button", {
        name: "Add",
        exact: true,
      });
    await userEvent.click(add());

    expect(await screen.findByText("Failed to add groups")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove Finches" }),
    ).not.toBeInTheDocument();
    await userEvent.click(add());

    expect(
      await screen.findByRole("button", { name: "Remove Finches" }),
    ).toBeInTheDocument();
    const requests = fetchMock.callHistory.calls(
      "path:/api/apps/sales/groups",
      { method: "POST" },
    );
    expect(requests).toHaveLength(2);
    expect(
      requests.map(({ options }) => JSON.parse(String(options.body))),
    ).toEqual([{ group_ids: [3, 4] }, { group_ids: [3, 4] }]);
  });

  it("returns to the previous page after removing the last group", async () => {
    setup({
      groups: Array.from({ length: 26 }, (_, index) => ({
        id: index + 100,
        name: `Group ${index + 1}`,
        member_count: 0,
      })),
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Next page" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Group 26" }),
    );

    expect(
      await screen.findByRole("button", { name: "Remove Group 1" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove Group 26" }),
    ).not.toBeInTheDocument();
  });
});
