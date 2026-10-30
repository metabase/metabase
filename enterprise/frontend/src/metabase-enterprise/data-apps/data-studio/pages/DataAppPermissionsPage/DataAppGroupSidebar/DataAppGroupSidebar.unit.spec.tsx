import userEvent from "@testing-library/user-event";

import { setupDataAppGroupPermissionWarningsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import type {
  DataAppGroup,
  DataAppGroupPermissionWarning,
} from "metabase-types/api";
import {
  createMockDataApp,
  createMockDataAppGroup,
  createMockDataAppGroupPermissionWarning,
  createMockDataAppMissingTable,
} from "metabase-types/api/mocks";

import { DataAppGroupSidebar } from "./DataAppGroupSidebar";

type SetupOpts = {
  group: DataAppGroup;
  warnings?: DataAppGroupPermissionWarning[];
};

function setup({ group, warnings = [] }: SetupOpts) {
  setupDataAppGroupPermissionWarningsEndpoint("sales", warnings);
  const onClose = jest.fn<void, []>();
  renderWithProviders(
    <DataAppGroupSidebar
      app={createMockDataApp({ name: "sales" })}
      group={group}
      containerWidth={1200}
      onResizeStart={jest.fn<void, []>()}
      onResizeStop={jest.fn<void, []>()}
      onClose={onClose}
    />,
  );
  return { onClose };
}

describe("DataAppGroupSidebar", () => {
  it("shows the group with its members and a link to it", async () => {
    setup({
      group: createMockDataAppGroup({
        id: 3,
        name: "Support",
        member_count: 12,
      }),
    });

    expect(
      await screen.findByRole("heading", { name: "Support" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Info" })).getByText("12"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View group" })).toHaveAttribute(
      "href",
      "/admin/people/groups/3",
    );
    expect(
      screen.queryByRole("region", { name: "Missing tables" }),
    ).not.toBeInTheDocument();
  });

  it("lists the tables the group can't view, each with a link to its permissions", async () => {
    setup({
      group: createMockDataAppGroup({ id: 4, name: "Finance" }),
      warnings: [
        createMockDataAppGroupPermissionWarning({
          group_id: 4,
          missing_tables: [
            createMockDataAppMissingTable({
              id: 10,
              name: "Orders",
              schema: "public",
              database_id: 1,
              database_name: "Shop",
            }),
          ],
        }),
      ],
    });

    const section = await screen.findByRole("region", {
      name: "Missing tables",
    });
    expect(within(section).getByText("Orders")).toBeInTheDocument();
    expect(within(section).getByText("Shop")).toBeInTheDocument();
    expect(within(section).getByText("public")).toBeInTheDocument();

    await userEvent.click(within(section).getByText("Orders"));

    expect(
      await screen.findByRole("menuitem", { name: /Change permissions/ }),
    ).toHaveAttribute(
      "href",
      "/admin/permissions/data/database/1/schema/public/table/10",
    );
  });

  it("closes", async () => {
    const { onClose } = setup({ group: createMockDataAppGroup() });

    await userEvent.click(await screen.findByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });
});
