import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupGroupsEndpoint } from "__support__/server-mocks/group";
import {
  setupDisableAdvancedMcpToolPermissionsEndpoint,
  setupEnableAdvancedMcpToolPermissionsEndpoint,
  setupMcpToolPermissionsEndpoint,
  setupUpdateMcpToolPermissionsEndpoint,
} from "__support__/server-mocks/metabot";
import { createMockSettingsState } from "__support__/state";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type { McpGroupPermission, McpTool } from "metabase-types/api";
import { createMockGroup } from "metabase-types/api/mocks";
import {
  createMockMcpGroupPermission,
  createMockMcpTool,
  createMockMcpToolPermissionsResponse,
} from "metabase-types/api/mocks/metabot";

import { McpToolsAccessPage } from "./McpToolsAccessPage";

const MCP_TOOLS_ACCESS_PATH = "/admin/metabot/usage-controls/mcp-tools-access";
const USAGE_LIMITS_PATH = "/admin/metabot/usage-controls/ai-usage-limits";
const MCP_PERMISSIONS_URL = "path:/api/ee/ai-controls/mcp-permissions";
const MCP_ADVANCED_URL = "path:/api/ee/ai-controls/mcp-permissions/advanced";

const adminGroup = createMockGroup({
  id: 1,
  name: "Administrators",
  member_count: 1,
  magic_group_type: "admin",
});

const allUsersGroup = createMockGroup({
  id: 2,
  name: "All Users",
  member_count: 5,
  magic_group_type: "all-internal-users",
});

const marketingGroup = createMockGroup({
  id: 3,
  name: "Marketing",
  member_count: 3,
  magic_group_type: null,
});

const engineeringGroup = createMockGroup({
  id: 4,
  name: "Engineering",
  member_count: 4,
  magic_group_type: null,
});

const defaultGroups = [adminGroup, allUsersGroup, marketingGroup];

const mcpTools = [
  createMockMcpTool({
    name: "search",
    scope: "agent:content:read",
    description: "Search for content.",
  }),
  createMockMcpTool({
    name: "run_query",
    scope: "agent:query:run",
    description: "Run a saved question.",
  }),
  createMockMcpTool({
    name: "run_sql",
    scope: "agent:sql:run",
    description: "Run raw SQL against a database.",
  }),
  createMockMcpTool({
    name: "question_write",
    scope: "agent:content:write",
    description: "Create, update, or archive a saved question.",
  }),
  createMockMcpTool({
    name: "transform_write",
    scope: "agent:content:write",
    description: "Create or update a transform.",
  }),
];

function createDefaultMcpPermissions(): McpGroupPermission[] {
  return [
    createMockMcpGroupPermission({ group_id: adminGroup.id }),
    createMockMcpGroupPermission({
      group_id: allUsersGroup.id,
      tool_access: { run_sql: "no" },
    }),
    createMockMcpGroupPermission({
      group_id: marketingGroup.id,
      tool_access: { question_write: "no" },
    }),
  ];
}

function setup({
  mcpPermissions = createDefaultMcpPermissions(),
  tools = mcpTools,
  groups = defaultGroups,
  useTenants = false,
  advanced = false,
}: {
  mcpPermissions?: McpGroupPermission[];
  tools?: McpTool[];
  groups?: typeof defaultGroups;
  useTenants?: boolean;
  advanced?: boolean;
} = {}) {
  setupGroupsEndpoint(groups);

  const response = createMockMcpToolPermissionsResponse({
    advanced,
    tools,
    permissions: mcpPermissions,
  });
  setupMcpToolPermissionsEndpoint(response);
  setupUpdateMcpToolPermissionsEndpoint(response);
  setupEnableAdvancedMcpToolPermissionsEndpoint({
    ...response,
    advanced: true,
  });
  setupDisableAdvancedMcpToolPermissionsEndpoint({
    ...response,
    advanced: false,
  });

  const { router } = renderWithProviders(
    <>
      <Route path={MCP_TOOLS_ACCESS_PATH} element={<McpToolsAccessPage />} />
      <Route path={USAGE_LIMITS_PATH} element={<div>USAGE LIMITS</div>} />
    </>,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: MCP_TOOLS_ACCESS_PATH,
      storeInitialState: {
        settings: createMockSettingsState({
          "use-tenants": useTenants,
          "mcp-enabled?": true,
        }),
      },
    },
  );

  return { response, router };
}

async function findGrid() {
  return screen.findByRole("table", { name: "MCP tools access" });
}

function getHeaderRow() {
  return screen.getAllByRole("row")[0];
}

function queryColumnHeader(name: string) {
  return screen.queryByRole("columnheader", { name });
}

function getToolCheckbox(groupName: string, toolName: string) {
  return screen.getByRole("checkbox", {
    name: `Allow ${groupName} user group to use the ${toolName} MCP tool.`,
  });
}

async function clickHeaderMenuItem(groupName: string, itemName: string) {
  await userEvent.click(screen.getByRole("button", { name: groupName }));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: itemName }),
  );
}

function querySaveButton() {
  return screen.queryByRole("button", { name: "Save changes" });
}

function querySwitchModeButton() {
  return screen.queryByRole("button", {
    name: "Switch to group-level permissions",
  });
}

function querySearchInput() {
  return screen.queryByRole("textbox", { name: "Search for a group" });
}

async function switchToGroupLevelMode() {
  await userEvent.click(
    screen.getByRole("button", { name: "Switch to group-level permissions" }),
  );
  const modal = await screen.findByRole("dialog", {
    name: "Switch to group-level permissions?",
  });
  await userEvent.click(within(modal).getByRole("button", { name: "Switch" }));
}

async function removeGroupLevelAccess() {
  await userEvent.click(screen.getByRole("button", { name: "Settings" }));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Remove group-level access" }),
  );
  const modal = await screen.findByRole("dialog", {
    name: "Remove group-level access?",
  });
  await userEvent.click(
    within(modal).getByRole("button", {
      name: "Remove access from all groups",
    }),
  );
}

async function savedPermissions() {
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(
      fetchMock.callHistory.called(MCP_PERMISSIONS_URL, { method: "PUT" }),
    ).toBe(true),
  );
  const calls = fetchMock.callHistory.calls(MCP_PERMISSIONS_URL, {
    method: "PUT",
  });
  expect(calls).toHaveLength(1);
  const body: { permissions: McpGroupPermission[] } =
    await calls[0].request?.json();
  return body.permissions;
}

describe("McpToolsAccessPage", () => {
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

  it("renders the title, the subtitle, and a row per bucket and tool", async () => {
    setup();
    await findGrid();

    expect(
      screen.getByRole("heading", { name: "MCP tools access" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Choose which MCP tools each group's AI clients/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("rowheader").map((cell) => cell.textContent),
    ).toEqual([
      "Read",
      "search",
      "Query",
      "run_query",
      "Raw SQL",
      "run_sql",
      "Write",
      "question_write",
      "transform_write",
    ]);
  });

  it("shows the admin and default groups with the Switch button in the header row in simple mode", async () => {
    setup();
    await findGrid();

    expect(queryColumnHeader("Administrators")).toBeInTheDocument();
    expect(queryColumnHeader("All Users")).toBeInTheDocument();
    expect(queryColumnHeader("Marketing")).not.toBeInTheDocument();
    expect(
      within(getHeaderRow()).getByRole("button", {
        name: "Switch to group-level permissions",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Settings" }),
    ).not.toBeInTheDocument();
    expect(querySearchInput()).not.toBeInTheDocument();
  });

  it("shows every group but the default one, the gear, and the search in group-level mode", async () => {
    setup({ advanced: true });
    await findGrid();

    expect(queryColumnHeader("Administrators")).toBeInTheDocument();
    expect(queryColumnHeader("All Users")).not.toBeInTheDocument();
    expect(queryColumnHeader("Marketing")).toBeInTheDocument();
    expect(querySwitchModeButton()).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(querySearchInput()).toBeInTheDocument();
  });

  it("locks Administrators on", async () => {
    setup();
    await findGrid();

    for (const tool of mcpTools) {
      const checkbox = getToolCheckbox("Administrators", tool.name);
      expect(checkbox).toBeChecked();
      expect(checkbox).toBeDisabled();
    }
  });

  it("reads each tool from the group's entries and the tools' defaults", async () => {
    setup();
    await findGrid();

    expect(getToolCheckbox("All Users", "search")).toBeChecked();
    expect(getToolCheckbox("All Users", "run_sql")).not.toBeChecked();
    expect(getToolCheckbox("All Users", "question_write")).toBeChecked();
    expect(getToolCheckbox("All Users", "search")).toBeEnabled();
  });

  it("unchecking a tool denies that tool only", async () => {
    setup();
    await findGrid();
    expect(querySaveButton()).not.toBeInTheDocument();

    await userEvent.click(getToolCheckbox("All Users", "question_write"));

    expect(getToolCheckbox("All Users", "question_write")).not.toBeChecked();
    expect(getToolCheckbox("All Users", "transform_write")).toBeChecked();
    expect(getToolCheckbox("Administrators", "question_write")).toBeChecked();
    expect(
      fetchMock.callHistory.called(MCP_PERMISSIONS_URL, { method: "PUT" }),
    ).toBe(false);
    expect(await savedPermissions()).toEqual([
      {
        group_id: allUsersGroup.id,
        mcp_enabled: true,
        tool_access: { run_sql: "no", question_write: "no" },
      },
    ]);
  });

  it("unchecking the last allowed tool turns the group off and keeps its entries", async () => {
    setup({
      mcpPermissions: [
        createMockMcpGroupPermission({ group_id: adminGroup.id }),
        createMockMcpGroupPermission({
          group_id: allUsersGroup.id,
          tool_access: {
            search: "no",
            run_query: "no",
            run_sql: "no",
            question_write: "no",
          },
        }),
      ],
    });
    await findGrid();
    expect(getToolCheckbox("All Users", "transform_write")).toBeChecked();

    await userEvent.click(getToolCheckbox("All Users", "transform_write"));

    expect(getToolCheckbox("All Users", "transform_write")).not.toBeChecked();
    expect(await savedPermissions()).toEqual([
      {
        group_id: allUsersGroup.id,
        mcp_enabled: false,
        tool_access: {
          search: "no",
          run_query: "no",
          run_sql: "no",
          question_write: "no",
          transform_write: "no",
        },
      },
    ]);
  });

  it("a tool with a denied default shows unchecked with no entry and checking it writes yes", async () => {
    setup({
      tools: [
        ...mcpTools,
        createMockMcpTool({
          name: "document_write",
          scope: "agent:content:write",
          description: "Create or update a document.",
          default_access: "denied",
        }),
      ],
    });
    await findGrid();
    expect(getToolCheckbox("All Users", "document_write")).not.toBeChecked();

    await userEvent.click(getToolCheckbox("All Users", "document_write"));

    expect(getToolCheckbox("All Users", "document_write")).toBeChecked();
    expect(await savedPermissions()).toEqual([
      {
        group_id: allUsersGroup.id,
        mcp_enabled: true,
        tool_access: { run_sql: "no", document_write: "yes" },
      },
    ]);
  });

  it("an edit on a group without a saved row turns it on with only that tool allowed", async () => {
    setup({
      mcpPermissions: [
        createMockMcpGroupPermission({ group_id: adminGroup.id }),
      ],
    });
    await findGrid();
    for (const tool of mcpTools) {
      expect(getToolCheckbox("All Users", tool.name)).not.toBeChecked();
    }

    await userEvent.click(getToolCheckbox("All Users", "search"));

    expect(getToolCheckbox("All Users", "search")).toBeChecked();
    expect(getToolCheckbox("All Users", "run_query")).not.toBeChecked();
    expect(await savedPermissions()).toEqual([
      {
        group_id: allUsersGroup.id,
        mcp_enabled: true,
        tool_access: {
          search: "yes",
          run_query: "no",
          run_sql: "no",
          question_write: "no",
          transform_write: "no",
        },
      },
    ]);
  });

  it("Allow all tools from a group header allows every tool for that group", async () => {
    setup();
    await findGrid();
    await clickHeaderMenuItem("All Users", "Allow all tools");

    for (const tool of mcpTools) {
      expect(getToolCheckbox("All Users", tool.name)).toBeChecked();
    }
    expect(await savedPermissions()).toEqual([
      {
        group_id: allUsersGroup.id,
        mcp_enabled: true,
        tool_access: {
          search: "yes",
          run_query: "yes",
          run_sql: "yes",
          question_write: "yes",
          transform_write: "yes",
        },
      },
    ]);
  });

  it("Cancel restores the saved permissions and hides the bar", async () => {
    setup();
    await findGrid();

    await userEvent.click(getToolCheckbox("All Users", "search"));
    expect(
      screen.getByText("You've made changes to MCP tool access."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(getToolCheckbox("All Users", "search")).toBeChecked();
    expect(querySaveButton()).not.toBeInTheDocument();
  });

  it("reports a failed save and keeps the draft", async () => {
    setup();
    await findGrid();
    fetchMock.modifyRoute("update-mcp-tool-permissions", {
      response: { status: 500, body: {} },
    });

    await userEvent.click(getToolCheckbox("All Users", "search"));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Failed to save MCP tool permissions"),
    ).toBeInTheDocument();
    expect(getToolCheckbox("All Users", "search")).not.toBeChecked();
    expect(querySaveButton()).toBeInTheDocument();
  });

  it("the switch button posts to the MCP advanced endpoint and drops unsaved edits", async () => {
    const { response } = setup();
    await findGrid();
    await userEvent.click(getToolCheckbox("All Users", "search"));
    expect(querySaveButton()).toBeInTheDocument();

    setupMcpToolPermissionsEndpoint({ ...response, advanced: true });
    await switchToGroupLevelMode();

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(MCP_ADVANCED_URL, { method: "POST" }),
      ).toBe(true),
    );
    expect(
      await screen.findByRole("columnheader", { name: "Marketing" }),
    ).toBeInTheDocument();
    expect(queryColumnHeader("All Users")).not.toBeInTheDocument();
    expect(querySaveButton()).not.toBeInTheDocument();
  });

  it("edits made before a mode round trip do not come back", async () => {
    const { response } = setup();
    await findGrid();
    await userEvent.click(getToolCheckbox("All Users", "search"));

    setupMcpToolPermissionsEndpoint({ ...response, advanced: true });
    await switchToGroupLevelMode();
    await screen.findByRole("columnheader", { name: "Marketing" });

    setupMcpToolPermissionsEndpoint({ ...response, advanced: false });
    await removeGroupLevelAccess();

    expect(
      await screen.findByRole("columnheader", { name: "All Users" }),
    ).toBeInTheDocument();
    expect(getToolCheckbox("All Users", "search")).toBeChecked();
    expect(querySaveButton()).not.toBeInTheDocument();
  });

  it("the gear menu deletes the MCP advanced endpoint", async () => {
    setup({ advanced: true });
    await findGrid();

    await removeGroupLevelAccess();

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(MCP_ADVANCED_URL, { method: "DELETE" }),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Remove group-level access?" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("the search filters the group columns by name and clearing it restores them", async () => {
    setup({ advanced: true, groups: [...defaultGroups, engineeringGroup] });
    await findGrid();
    expect(queryColumnHeader("Engineering")).toBeInTheDocument();

    const search = screen.getByRole("textbox", { name: "Search for a group" });
    await userEvent.type(search, " mark ");

    expect(queryColumnHeader("Marketing")).toBeInTheDocument();
    expect(queryColumnHeader("Engineering")).not.toBeInTheDocument();
    expect(queryColumnHeader("Administrators")).not.toBeInTheDocument();
    expect(getToolCheckbox("Marketing", "search")).toBeInTheDocument();

    await userEvent.clear(search);

    expect(queryColumnHeader("Administrators")).toBeInTheDocument();
    expect(queryColumnHeader("Marketing")).toBeInTheDocument();
    expect(queryColumnHeader("Engineering")).toBeInTheDocument();
  });

  it("says when no group matches the search", async () => {
    setup({ advanced: true });
    await findGrid();

    await userEvent.type(
      screen.getByRole("textbox", { name: "Search for a group" }),
      "nobody",
    );

    expect(screen.getByText("No groups match your search")).toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: "MCP tools access" }),
    ).not.toBeInTheDocument();
  });

  it("asks before leaving with unsaved changes and keeps the draft on Cancel", async () => {
    const { router } = setup();
    await findGrid();
    await userEvent.click(getToolCheckbox("All Users", "search"));

    act(() => {
      router?.navigate(USAGE_LIMITS_PATH);
    });

    const modal = await screen.findByTestId("leave-confirmation");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Cancel" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument(),
    );
    expect(router?.location.pathname).toBe(MCP_TOOLS_ACCESS_PATH);
    expect(getToolCheckbox("All Users", "search")).not.toBeChecked();
    expect(querySaveButton()).toBeInTheDocument();
  });

  it("shows tenant tabs only when use-tenants is on", async () => {
    setup({ useTenants: true });
    await findGrid();

    expect(screen.getByText("User groups")).toBeInTheDocument();
    expect(screen.getByText("Tenant groups")).toBeInTheDocument();
  });

  it("does not show tenant tabs when use-tenants is off", async () => {
    setup();
    await findGrid();

    expect(screen.queryByText("User groups")).not.toBeInTheDocument();
    expect(screen.queryByText("Tenant groups")).not.toBeInTheDocument();
  });
});
