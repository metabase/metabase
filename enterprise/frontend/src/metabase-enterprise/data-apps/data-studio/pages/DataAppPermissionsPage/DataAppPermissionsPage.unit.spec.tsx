import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDataAppEndpoint,
  setupDataAppGroupPermissionWarningsEndpoint,
  setupDataAppGroupsEndpoint,
  setupGroupsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type { DataAppGroup, GroupId } from "metabase-types/api";
import {
  createMockDataApp,
  createMockDataAppGroup,
  createMockGroup,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { DataAppPermissionsPage } from "./DataAppPermissionsPage";

const { trackSimpleEvent } = jest.requireMock<{
  trackSimpleEvent: jest.Mock;
}>("metabase/analytics");

const EMPTY_STATE_TEXT =
  "Only admins can open this app. Add groups to give people in them access.";

const FINANCE_GROUP = createMockDataAppGroup({
  id: 4,
  name: "Finance",
  member_count: 3,
});

const ALL_TENANT_USERS_GROUP = createMockDataAppGroup({
  id: 5,
  name: "All tenant users",
  member_count: 1,
  is_tenant_group: true,
});

const ASSIGNABLE_GROUPS = [FINANCE_GROUP, ALL_TENANT_USERS_GROUP];

type SetupOpts = {
  allowedHosts: string[];
};

function setup({ allowedHosts }: SetupOpts) {
  const app = createMockDataApp({ slug: "sales", allowed_hosts: allowedHosts });
  setupDataAppEndpoint(app);
  setupDataAppGroupsEndpoint(app.slug, []);

  renderWithProviders(
    <Route
      path="/data-studio/apps/:slug/permissions"
      element={<DataAppPermissionsPage />}
    />,
    {
      withRouter: true,
      initialRoute: `/data-studio/apps/${app.slug}/permissions`,
    },
  );
}

const isGroupIdList = (value: unknown): value is GroupId[] =>
  Array.isArray(value) && value.every((id) => typeof id === "number");

function readGroupIds(body: unknown): GroupId[] {
  const request: unknown = typeof body === "string" ? JSON.parse(body) : null;
  if (
    typeof request === "object" &&
    request != null &&
    "group_ids" in request &&
    isGroupIdList(request.group_ids)
  ) {
    return request.group_ids;
  }
  return [];
}

/**
 * Keeps the app's groups on a fake server, so the page only shows a group
 * after the request that adds it, and stops showing it after the one that
 * removes it.
 */
function setupGroupAccessServer(slug: string) {
  let assignedGroups: DataAppGroup[] = [];

  fetchMock.get(`path:/api/ee/apps/${slug}/groups`, () => assignedGroups);
  fetchMock.post(`path:/api/ee/apps/${slug}/groups`, (call) => {
    const groupIds = readGroupIds(call.options.body);
    assignedGroups = [
      ...assignedGroups,
      ...ASSIGNABLE_GROUPS.filter((group) => groupIds.includes(group.id)),
    ];
    return assignedGroups;
  });
  fetchMock.delete(`express:/api/ee/apps/${slug}/groups/:groupId`, (call) => {
    const groupId = Number(call.expressParams?.groupId);
    assignedGroups = assignedGroups.filter((group) => group.id !== groupId);
    return 204;
  });
}

function setupWithTenants() {
  const app = createMockDataApp({ id: 9, slug: "teams", name: "Teams" });
  setupDataAppEndpoint(app);
  setupGroupAccessServer(app.slug);
  setupDataAppGroupPermissionWarningsEndpoint(app.slug, []);
  setupGroupsEndpoint([
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
    createMockGroup({ id: FINANCE_GROUP.id, name: FINANCE_GROUP.name }),
    createMockGroup({
      id: ALL_TENANT_USERS_GROUP.id,
      name: ALL_TENANT_USERS_GROUP.name,
      magic_group_type: "all-external-users",
      is_tenant_group: true,
    }),
  ]);

  renderWithProviders(
    <Route
      path="/data-studio/apps/:slug/permissions"
      element={<DataAppPermissionsPage />}
    />,
    {
      withRouter: true,
      initialRoute: `/data-studio/apps/${app.slug}/permissions`,
      storeInitialState: createMockState({
        settings: mockSettings(
          createMockSettings({
            "use-tenants": true,
            "token-features": createMockTokenFeatures({ tenants: true }),
          }),
        ),
      }),
    },
  );
}

async function removeGroupAccess(groupName: string) {
  await userEvent.click(
    screen.getByRole("button", { name: `${groupName} options` }),
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: /Remove access/ }),
  );
  await userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Remove access",
    }),
  );
}

describe("DataAppPermissionsPage", () => {
  afterEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("warns that permissions don't cover data from the app's external hosts", async () => {
    setup({ allowedHosts: ["https://en.wikipedia.org"] });

    const note = await screen.findByRole("alert");
    expect(note).toHaveTextContent(
      "Permissions don't apply to data from those hosts",
    );
    expect(
      within(note).getByRole("link", { name: "Overview page" }),
    ).toHaveAttribute("href", "/data-studio/apps/sales");
  });

  it("has no external hosts note when the app can't connect to any", async () => {
    setup({ allowedHosts: [] });

    expect(
      await screen.findByRole("button", { name: "Add groups" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("adds tenant and internal groups, then removes their access one by one", async () => {
    mockGetBoundingClientRect({ width: 1000, height: 1000 });
    setupWithTenants();

    expect(await screen.findByText(EMPTY_STATE_TEXT)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add groups" }));
    const modal = await screen.findByRole("dialog");
    await userEvent.click(
      within(modal).getByRole("textbox", { name: "Groups" }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "All tenant users" }),
    );
    await userEvent.click(
      within(modal).getByRole("textbox", { name: "Groups" }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Finance" }),
    );
    await userEvent.click(within(modal).getByRole("button", { name: "Add" }));

    const tenantRow = await screen.findByRole("row", {
      name: /All tenant users/,
    });
    expect(
      within(tenantRow).getByRole("img", { name: "Tenant group" }),
    ).toBeInTheDocument();
    const financeRow = screen.getByRole("row", { name: /Finance/ });
    expect(
      within(financeRow).getByRole("img", { name: "Internal group" }),
    ).toBeInTheDocument();
    expect(
      within(financeRow).queryByRole("img", { name: "Tenant group" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(EMPTY_STATE_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const addCalls = fetchMock.callHistory.calls(
      "path:/api/ee/apps/teams/groups",
      { method: "POST" },
    );
    expect(addCalls).toHaveLength(1);
    expect(JSON.parse(String(addCalls[0].options.body))).toEqual({
      group_ids: [ALL_TENANT_USERS_GROUP.id, FINANCE_GROUP.id],
    });
    expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "data_app_group_added",
      target_id: 9,
    });

    await removeGroupAccess("All tenant users");

    await waitFor(() =>
      expect(
        screen.queryByRole("row", { name: /All tenant users/ }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("row", { name: /Finance/ })).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_STATE_TEXT)).not.toBeInTheDocument();
    const removeCalls = fetchMock.callHistory.calls(
      "begin:http://localhost/api/ee/apps/teams/groups/",
      { method: "DELETE" },
    );
    expect(removeCalls.map((call) => new URL(call.url).pathname)).toEqual([
      `/api/ee/apps/teams/groups/${ALL_TENANT_USERS_GROUP.id}`,
    ]);
    expect(trackSimpleEvent).toHaveBeenLastCalledWith({
      event: "data_app_group_removed",
      target_id: 9,
    });

    await removeGroupAccess("Finance");

    expect(await screen.findByText(EMPTY_STATE_TEXT)).toBeInTheDocument();
    expect(trackSimpleEvent).toHaveBeenCalledTimes(3);
    expect(trackSimpleEvent).toHaveBeenLastCalledWith({
      event: "data_app_group_removed",
      target_id: 9,
    });
  });
});
