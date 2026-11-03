import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDataAppGroupPermissionWarningsEndpoint,
  setupDataAppGroupsEndpoint,
  setupRemoveDataAppGroupEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import type {
  DataAppGroup,
  DataAppGroupPermissionWarning,
  GroupId,
} from "metabase-types/api";
import {
  createMockDataApp,
  createMockDataAppGroup,
  createMockDataAppGroupPermissionWarning,
  createMockSettings,
} from "metabase-types/api/mocks";

import { DataAppGroupList } from "./DataAppGroupList";

type SetupOpts = {
  groups: DataAppGroup[];
  warnings?: DataAppGroupPermissionWarning[];
  useTenants?: boolean;
};

function setup({ groups, warnings = [], useTenants = false }: SetupOpts) {
  const onSelectGroup = jest.fn<void, [GroupId]>();
  setupDataAppGroupsEndpoint("sales", groups);
  setupDataAppGroupPermissionWarningsEndpoint("sales", warnings);
  groups.forEach((group) => setupRemoveDataAppGroupEndpoint("sales", group.id));
  renderWithProviders(
    <DataAppGroupList
      app={createMockDataApp({ name: "sales", display_name: "Sales" })}
      selectedGroupId={undefined}
      onSelectGroup={onSelectGroup}
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings(
          createMockSettings({ "use-tenants": useTenants }),
        ),
      }),
    },
  );
  return { onSelectGroup };
}

describe("DataAppGroupList", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 1000, height: 1000 });
  });

  it("lists the groups with their members and missing data access", async () => {
    setup({
      groups: [
        createMockDataAppGroup({ id: 3, name: "Support", member_count: 12 }),
        createMockDataAppGroup({
          id: 4,
          name: "Finance",
          member_count: 4,
          is_tenant_group: true,
        }),
      ],
      warnings: [createMockDataAppGroupPermissionWarning({ group_id: 4 })],
    });

    expect(await screen.findByText("Support")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Type" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /Internal group|Tenant group/ }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Missing 1 table")).toBeInTheDocument();
    expect(screen.getByText("All tables")).toBeInTheDocument();
  });

  it.each([
    { label: "Internal group", isTenantGroup: false, icon: "group" },
    { label: "Tenant group", isTenantGroup: true, icon: "globe" },
  ])(
    "shows the $label icon and hover hint when tenants are enabled",
    async ({ label, isTenantGroup, icon }) => {
      setup({
        useTenants: true,
        groups: [createMockDataAppGroup({ is_tenant_group: isTenantGroup })],
      });

      const typeIcon = await screen.findByRole("img", { name: label });

      expect(
        screen.getByRole("columnheader", { name: "Type" }),
      ).toBeInTheDocument();
      expect(typeIcon).toHaveClass(`Icon-${icon}`);

      await userEvent.hover(typeIcon);

      expect(await screen.findByRole("tooltip")).toHaveTextContent(label);
    },
  );

  it("links tenant groups to their management page", async () => {
    setup({
      groups: [
        createMockDataAppGroup({
          id: 7,
          name: "Tenant support",
          is_tenant_group: true,
        }),
      ],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Tenant support options" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: /View group/ }),
    ).toHaveAttribute("href", "/admin/people/tenants/groups/7");
  });

  it("selects a group when its row is clicked", async () => {
    const { onSelectGroup } = setup({
      groups: [createMockDataAppGroup({ id: 3, name: "Support" })],
    });

    await userEvent.click(await screen.findByText("Support"));

    expect(onSelectGroup).toHaveBeenCalledWith(3);
  });

  it("says only admins can open an app without groups", async () => {
    setup({ groups: [] });

    expect(
      await screen.findByText(
        "Only admins can open this app. Add groups to give people in them access.",
      ),
    ).toBeInTheDocument();
  });

  it("links to the group and removes its access after confirmation", async () => {
    setup({
      groups: [
        createMockDataAppGroup({ id: 3, name: "Support", member_count: 12 }),
      ],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Support options" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: /View group/ }),
    ).toHaveAttribute("href", "/admin/people/groups/3");

    await userEvent.click(
      screen.getByRole("menuitem", { name: /Remove access/ }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Remove Support from Sales?"),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/ee/apps/sales/groups/3", {
        method: "DELETE",
      }),
    ).toHaveLength(0);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Remove access" }),
    );

    expect(
      fetchMock.callHistory.calls("path:/api/ee/apps/sales/groups/3", {
        method: "DELETE",
      }),
    ).toHaveLength(1);
  });
});
