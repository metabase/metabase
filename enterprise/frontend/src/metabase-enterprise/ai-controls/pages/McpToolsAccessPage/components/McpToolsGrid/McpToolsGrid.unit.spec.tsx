import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { GroupInfo, McpGroupPermission } from "metabase-types/api";
import { createMockGroup } from "metabase-types/api/mocks";
import {
  createMockMcpGroupPermission,
  createMockMcpTool,
} from "metabase-types/api/mocks/metabot";

import { McpToolsGrid } from "./McpToolsGrid";
import {
  GROUP_COLUMN_WIDTH_PX,
  SWITCH_COLUMN_MIN_WIDTH_PX,
  TOOL_COLUMN_WIDTH_PX,
} from "./constants";
import { useGroupColumnVirtualizer } from "./use-group-column-virtualizer";
import { buildGridColumns, buildGridRows, setToolsAllowed } from "./utils";

const search = createMockMcpTool({
  name: "search",
  scope: "agent:content:read",
  description: "Search for content.",
});
const runSql = createMockMcpTool({
  name: "run_sql",
  scope: "agent:sql:run",
  default_access: "denied",
});
const questionWrite = createMockMcpTool({
  name: "question_write",
  scope: "agent:content:write",
});
const transformWrite = createMockMcpTool({
  name: "transform_write",
  scope: "agent:content:write",
});
const tools = [search, runSql, questionWrite, transformWrite];

const adminGroup = createMockGroup({
  id: 1,
  name: "Administrators",
  magic_group_type: "admin",
});
const allUsersGroup = createMockGroup({
  id: 2,
  name: "All Users",
  magic_group_type: "all-internal-users",
});
const marketingGroup = createMockGroup({
  id: 3,
  name: "Marketing",
  magic_group_type: null,
});

const allUsersPermission = createMockMcpGroupPermission({
  group_id: allUsersGroup.id,
  tool_access: { search: "no", transform_write: "no" },
});
const marketingPermission = createMockMcpGroupPermission({
  group_id: marketingGroup.id,
  tool_access: { run_sql: "yes" },
});

type SetupOptions = {
  groups?: GroupInfo[];
  permissionsByGroup?: Record<number, McpGroupPermission>;
  headerTrailing?: ReactNode;
};

function setup({
  groups = [adminGroup, allUsersGroup, marketingGroup],
  permissionsByGroup = {
    [allUsersGroup.id]: allUsersPermission,
    [marketingGroup.id]: marketingPermission,
  },
  headerTrailing,
}: SetupOptions = {}) {
  const onPermissionChange = jest.fn();
  const columns = buildGridColumns(groups, permissionsByGroup);
  renderWithProviders(
    <McpToolsGrid
      rows={buildGridRows(tools)}
      columns={columns}
      allTools={tools}
      headerTrailing={headerTrailing}
      onPermissionChange={onPermissionChange}
    />,
  );
  return { onPermissionChange, columns };
}

function getCheckbox(groupName: string, toolName: string) {
  return screen.getByRole("checkbox", {
    name: `Allow ${groupName} user group to use the ${toolName} MCP tool.`,
  });
}

async function openHeaderMenu(groupName: string) {
  await userEvent.click(screen.getByRole("button", { name: groupName }));
  return {
    allowAll: await screen.findByRole("menuitem", { name: "Allow all tools" }),
    blockAll: await screen.findByRole("menuitem", { name: "Block all tools" }),
  };
}

type VirtualizerProbeProps = { columnCount: number };

function VirtualizerProbe({ columnCount }: VirtualizerProbeProps) {
  const virtualizer = useGroupColumnVirtualizer(columnCount);
  return (
    <div
      ref={virtualizer.scrollRef}
      data-testid="virtualizer-probe"
      data-rendered={virtualizer.virtualColumns.length}
      data-leading={virtualizer.leadingSpacerWidth}
      data-trailing={virtualizer.trailingSpacerWidth}
      data-table-min-width={virtualizer.tableMinWidth}
    />
  );
}

describe("McpToolsGrid", () => {
  const originalGetBoundingClientRect =
    HTMLElement.prototype.getBoundingClientRect;

  beforeAll(() => {
    // needed for @tanstack/react-virtual, see https://github.com/TanStack/virtual/issues/29#issuecomment-657519522
    HTMLElement.prototype.getBoundingClientRect = jest
      .fn()
      .mockReturnValue({ height: 400, width: 800, top: 0, left: 0 });
  });

  afterAll(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it("renders a column header per group and a row header per bucket and tool", () => {
    setup();

    expect(
      screen.getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toEqual(["MCP tools", "Administrators", "All Users", "Marketing"]);
    expect(
      screen.getAllByRole("rowheader").map((cell) => cell.textContent),
    ).toEqual([
      "Read",
      "search",
      "Raw SQL",
      "run_sql",
      "Write",
      "question_write",
      "transform_write",
    ]);
  });

  it("renders one checkbox per tool per group reflecting entries and defaults", () => {
    setup();

    expect(screen.getAllByRole("checkbox")).toHaveLength(tools.length * 3);
    expect(getCheckbox("All Users", "search")).not.toBeChecked();
    expect(getCheckbox("All Users", "run_sql")).not.toBeChecked();
    expect(getCheckbox("All Users", "question_write")).toBeChecked();
    expect(getCheckbox("All Users", "transform_write")).not.toBeChecked();
    expect(getCheckbox("Marketing", "search")).toBeChecked();
    expect(getCheckbox("Marketing", "run_sql")).toBeChecked();
  });

  it("shows Administrators checked and disabled", () => {
    setup();

    for (const tool of tools) {
      const checkbox = getCheckbox("Administrators", tool.name);
      expect(checkbox).toBeChecked();
      expect(checkbox).toBeDisabled();
    }
  });

  it("reports the permission setToolsAllowed derives when a cell is clicked", async () => {
    const { onPermissionChange } = setup();

    await userEvent.click(getCheckbox("All Users", "question_write"));

    expect(onPermissionChange).toHaveBeenCalledTimes(1);
    expect(onPermissionChange).toHaveBeenCalledWith(
      setToolsAllowed(allUsersPermission, tools, [questionWrite], false),
    );
  });

  describe("group header menu", () => {
    it("disables the action matching the group's state", async () => {
      setup({
        permissionsByGroup: { [allUsersGroup.id]: allUsersPermission },
      });

      const someMenu = await openHeaderMenu("All Users");
      expect(someMenu.allowAll).toBeEnabled();
      expect(someMenu.blockAll).toBeEnabled();
      await userEvent.keyboard("{Escape}");

      const noneMenu = await openHeaderMenu("Marketing");
      expect(noneMenu.allowAll).toBeEnabled();
      expect(noneMenu.blockAll).toBeDisabled();
    });

    it("disables Allow all tools when every tool is allowed", async () => {
      setup();

      const menu = await openHeaderMenu("Marketing");
      expect(menu.allowAll).toBeDisabled();
      expect(menu.blockAll).toBeEnabled();
    });

    it("allows every tool and turns the group on", async () => {
      const { onPermissionChange } = setup({
        permissionsByGroup: { [allUsersGroup.id]: allUsersPermission },
      });

      const menu = await openHeaderMenu("Marketing");
      await userEvent.click(menu.allowAll);

      expect(onPermissionChange).toHaveBeenCalledWith({
        group_id: marketingGroup.id,
        mcp_enabled: true,
        tool_access: {
          search: "yes",
          run_sql: "yes",
          question_write: "yes",
          transform_write: "yes",
        },
      });
    });

    it("blocks every tool and turns the group off", async () => {
      const { onPermissionChange } = setup();

      const menu = await openHeaderMenu("Marketing");
      await userEvent.click(menu.blockAll);

      expect(onPermissionChange).toHaveBeenCalledWith({
        group_id: marketingGroup.id,
        mcp_enabled: false,
        tool_access: {
          search: "no",
          run_sql: "no",
          question_write: "no",
          transform_write: "no",
        },
      });
    });

    it("has no menu for Administrators", () => {
      setup();

      expect(
        screen.queryByRole("button", { name: "Administrators" }),
      ).not.toBeInTheDocument();
    });
  });

  it("renders bucket rows without checkboxes", () => {
    setup();

    const readRow = screen.getByRole("row", { name: /^Read/ });
    expect(within(readRow).queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("shows the tool description from the info button", async () => {
    setup();

    await userEvent.hover(screen.getByRole("button", { name: "About search" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Search for content.",
    );
  });

  it("renders headerTrailing in the header row and widens the table for it", () => {
    setup({ headerTrailing: <button>Switch</button> });

    const headerRow = screen.getAllByRole("row")[0];
    expect(
      within(headerRow).getByRole("button", { name: "Switch" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveStyle({
      width: `${TOOL_COLUMN_WIDTH_PX + 3 * GROUP_COLUMN_WIDTH_PX + SWITCH_COLUMN_MIN_WIDTH_PX}px`,
    });
  });

  describe("with 150 groups", () => {
    const manyGroups = Array.from({ length: 150 }, (_, index) =>
      createMockGroup({
        id: index + 10,
        name: `Perf group ${String(index + 1).padStart(3, "0")}`,
        magic_group_type: null,
      }),
    );

    it("renders only the columns near the viewport", () => {
      setup({ groups: manyGroups, permissionsByGroup: {} });

      const headers = screen.getAllByRole("columnheader");
      expect(headers.length).toBeGreaterThan(1);
      expect(headers.length).toBeLessThan(40);
      expect(headers[0]).toHaveTextContent("MCP tools");
      expect(headers[1]).toHaveTextContent("Perf group 001");
    });

    it("keeps the spacers and rendered columns summing to the full group width", () => {
      renderWithProviders(<VirtualizerProbe columnCount={manyGroups.length} />);

      const probe = screen.getByTestId("virtualizer-probe");
      const rendered = Number(probe.getAttribute("data-rendered"));
      const leading = Number(probe.getAttribute("data-leading"));
      const trailing = Number(probe.getAttribute("data-trailing"));
      const groupsTotalWidth = manyGroups.length * GROUP_COLUMN_WIDTH_PX;

      expect(rendered).toBeGreaterThan(0);
      expect(rendered).toBeLessThan(manyGroups.length);
      expect(leading).toBe(0);
      expect(leading + rendered * GROUP_COLUMN_WIDTH_PX + trailing).toBe(
        groupsTotalWidth,
      );
      expect(probe).toHaveAttribute(
        "data-table-min-width",
        String(TOOL_COLUMN_WIDTH_PX + groupsTotalWidth),
      );
    });
  });
});
