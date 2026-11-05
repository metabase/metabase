import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDataAppGroupPermissionWarningsEndpoint,
  setupDataAppGroupsEndpoint,
  setupRemoveDataAppGroupEndpoint,
} from "__support__/server-mocks";
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
} from "metabase-types/api/mocks";

import { DataAppGroupList } from "./DataAppGroupList";

type SetupOpts = {
  groups: DataAppGroup[];
  warnings?: DataAppGroupPermissionWarning[];
};

function setup({ groups, warnings = [] }: SetupOpts) {
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
        createMockDataAppGroup({ id: 4, name: "Finance", member_count: 4 }),
      ],
      warnings: [createMockDataAppGroupPermissionWarning({ group_id: 4 })],
    });

    expect(await screen.findByText("Support")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(await screen.findByText("Missing 1 table")).toBeInTheDocument();
    expect(screen.getByText("All tables")).toBeInTheDocument();
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
