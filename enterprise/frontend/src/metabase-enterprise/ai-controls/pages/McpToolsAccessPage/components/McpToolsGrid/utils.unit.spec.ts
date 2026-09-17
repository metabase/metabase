import { createMockGroup } from "metabase-types/api/mocks";
import {
  createMockMcpGroupPermission,
  createMockMcpTool,
} from "metabase-types/api/mocks/metabot";

import {
  buildGridColumns,
  buildGridRows,
  filterGridColumns,
  getDisabledPermission,
  getScopeLabel,
  getToolsAccessState,
  groupToolsByScope,
  isToolAllowed,
  setToolsAllowed,
} from "./utils";

const search = createMockMcpTool({
  name: "search",
  scope: "agent:content:read",
});
const runQuery = createMockMcpTool({
  name: "run_query",
  scope: "agent:query:run",
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
const allTools = [questionWrite, search, runSql, runQuery, transformWrite];
const writeTools = [questionWrite, transformWrite];

const enabled = createMockMcpGroupPermission({ group_id: 2 });
const disabled = createMockMcpGroupPermission({
  group_id: 2,
  mcp_enabled: false,
});

describe("getScopeLabel", () => {
  it("maps known scopes to short labels", () => {
    expect(getScopeLabel("agent:content:read")).toBe("Read");
    expect(getScopeLabel("agent:query:run")).toBe("Query");
    expect(getScopeLabel("agent:sql:run")).toBe("Raw SQL");
    expect(getScopeLabel("agent:content:write")).toBe("Write");
    expect(getScopeLabel("agent:delivery:write")).toBe("Deliveries");
  });

  it("falls back to the scope string", () => {
    expect(getScopeLabel("agent:future:thing")).toBe("agent:future:thing");
  });
});

describe("getDisabledPermission", () => {
  it("is off with no entries", () => {
    expect(getDisabledPermission(7)).toEqual({
      group_id: 7,
      mcp_enabled: false,
      tool_access: {},
    });
  });
});

describe("isToolAllowed", () => {
  it("allows a tool with no entry whose default is allowed", () => {
    expect(isToolAllowed(enabled, search)).toBe(true);
  });

  it("denies a tool with no entry whose default is denied", () => {
    expect(isToolAllowed(enabled, runSql)).toBe(false);
  });

  it("an explicit no beats a default of allowed", () => {
    expect(
      isToolAllowed({ ...enabled, tool_access: { search: "no" } }, search),
    ).toBe(false);
  });

  it("an explicit yes beats a default of denied", () => {
    expect(
      isToolAllowed({ ...enabled, tool_access: { run_sql: "yes" } }, runSql),
    ).toBe(true);
  });

  it("allows nothing while MCP is off, whatever the entries say", () => {
    expect(
      isToolAllowed({ ...disabled, tool_access: { search: "yes" } }, search),
    ).toBe(false);
  });
});

describe("setToolsAllowed", () => {
  it("allowing one tool writes yes for it", () => {
    expect(setToolsAllowed(enabled, allTools, [search], true)).toEqual({
      group_id: 2,
      mcp_enabled: true,
      tool_access: { search: "yes" },
    });
  });

  it("allowing several tools writes yes for each and keeps the other entries", () => {
    expect(
      setToolsAllowed(
        { ...enabled, tool_access: { run_sql: "yes", search: "no" } },
        allTools,
        writeTools,
        true,
      ),
    ).toEqual({
      group_id: 2,
      mcp_enabled: true,
      tool_access: {
        run_sql: "yes",
        search: "no",
        question_write: "yes",
        transform_write: "yes",
      },
    });
  });

  it("denying one tool writes no for it and keeps the other entries", () => {
    expect(
      setToolsAllowed(
        { ...enabled, tool_access: { run_sql: "yes" } },
        allTools,
        [questionWrite],
        false,
      ),
    ).toEqual({
      group_id: 2,
      mcp_enabled: true,
      tool_access: { run_sql: "yes", question_write: "no" },
    });
  });

  it("denying several tools writes no for each while another tool still resolves to yes", () => {
    expect(setToolsAllowed(enabled, allTools, writeTools, false)).toEqual({
      group_id: 2,
      mcp_enabled: true,
      tool_access: { question_write: "no", transform_write: "no" },
    });
  });

  it("allowing a bucket while MCP is off switches it on, allows the bucket, and pins every other tool to no", () => {
    expect(
      setToolsAllowed(
        { ...disabled, tool_access: { search: "yes" } },
        allTools,
        writeTools,
        true,
      ),
    ).toEqual({
      group_id: 2,
      mcp_enabled: true,
      tool_access: {
        search: "no",
        run_query: "no",
        run_sql: "no",
        question_write: "yes",
        transform_write: "yes",
      },
    });
  });

  it("denying the last tool that still resolves to yes switches MCP off and keeps every entry", () => {
    expect(
      setToolsAllowed(
        {
          ...enabled,
          tool_access: { question_write: "no", search: "no", run_query: "no" },
        },
        allTools,
        [transformWrite],
        false,
      ),
    ).toEqual({
      group_id: 2,
      mcp_enabled: false,
      tool_access: {
        question_write: "no",
        search: "no",
        run_query: "no",
        transform_write: "no",
      },
    });
  });

  it("denying every tool switches MCP off with an entry per tool kept", () => {
    const manyTools = Array.from({ length: 24 }, (_, index) =>
      createMockMcpTool({ name: `tool_${index}` }),
    );
    const next = setToolsAllowed(enabled, manyTools, manyTools, false);
    expect(next.mcp_enabled).toBe(false);
    expect(Object.keys(next.tool_access)).toHaveLength(24);
    expect(Object.values(next.tool_access)).toEqual(Array(24).fill("no"));
  });

  it("a denied-default tool with no entry reads unchecked and allowing it writes yes", () => {
    expect(isToolAllowed(enabled, runSql)).toBe(false);
    const next = setToolsAllowed(enabled, allTools, [runSql], true);
    expect(next.tool_access).toEqual({ run_sql: "yes" });
    expect(isToolAllowed(next, runSql)).toBe(true);
  });
});

describe("getToolsAccessState", () => {
  it("is all when every tool resolves to yes", () => {
    expect(getToolsAccessState(enabled, writeTools)).toBe("all");
    expect(
      getToolsAccessState({ ...enabled, tool_access: { run_sql: "yes" } }, [
        runSql,
        search,
      ]),
    ).toBe("all");
  });

  it("is some when an explicit no leaves the rest allowed", () => {
    expect(
      getToolsAccessState(
        { ...enabled, tool_access: { question_write: "no" } },
        writeTools,
      ),
    ).toBe("some");
  });

  it("is some when a denied-default tool with no entry sits among allowed ones", () => {
    expect(getToolsAccessState(enabled, allTools)).toBe("some");
  });

  it("is none when no tool resolves to yes", () => {
    expect(
      getToolsAccessState(
        {
          ...enabled,
          tool_access: { question_write: "no", transform_write: "no" },
        },
        writeTools,
      ),
    ).toBe("none");
  });

  it("is none while MCP is off, whatever the entries say", () => {
    expect(
      getToolsAccessState({ ...disabled, tool_access: { search: "yes" } }, [
        search,
      ]),
    ).toBe("none");
  });
});

describe("groupToolsByScope", () => {
  it("orders buckets by the known scope order and keeps registry order inside", () => {
    expect(groupToolsByScope(allTools)).toEqual([
      { scope: "agent:content:read", tools: [search] },
      { scope: "agent:query:run", tools: [runQuery] },
      { scope: "agent:sql:run", tools: [runSql] },
      { scope: "agent:content:write", tools: [questionWrite, transformWrite] },
    ]);
  });

  it("appends unknown scopes after the known ones", () => {
    const custom = createMockMcpTool({ name: "custom", scope: "agent:custom" });
    expect(groupToolsByScope([custom, search]).map((b) => b.scope)).toEqual([
      "agent:content:read",
      "agent:custom",
    ]);
  });
});

describe("buildGridRows", () => {
  it("emits a bucket row followed by its tool rows in scope order with stable ids", () => {
    expect(buildGridRows(allTools)).toEqual([
      {
        kind: "bucket",
        id: "bucket:agent:content:read",
        scope: "agent:content:read",
        label: "Read",
      },
      { kind: "tool", id: "tool:search", tool: search },
      {
        kind: "bucket",
        id: "bucket:agent:query:run",
        scope: "agent:query:run",
        label: "Query",
      },
      { kind: "tool", id: "tool:run_query", tool: runQuery },
      {
        kind: "bucket",
        id: "bucket:agent:sql:run",
        scope: "agent:sql:run",
        label: "Raw SQL",
      },
      { kind: "tool", id: "tool:run_sql", tool: runSql },
      {
        kind: "bucket",
        id: "bucket:agent:content:write",
        scope: "agent:content:write",
        label: "Write",
      },
      { kind: "tool", id: "tool:question_write", tool: questionWrite },
      { kind: "tool", id: "tool:transform_write", tool: transformWrite },
    ]);
  });

  it("is empty without tools", () => {
    expect(buildGridRows([])).toEqual([]);
  });
});

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
const externalGroup = createMockGroup({
  id: 3,
  name: "All External Users",
  magic_group_type: "all-external-users",
});
const zebraGroup = createMockGroup({
  id: 4,
  name: "zebra",
  magic_group_type: null,
});
const alphaGroup = createMockGroup({
  id: 5,
  name: "Alpha",
  magic_group_type: null,
});

describe("buildGridColumns", () => {
  it("orders groups as the permissions pages do: Administrators, All Users, then the rest by name", () => {
    const columns = buildGridColumns(
      [zebraGroup, externalGroup, alphaGroup, allUsersGroup, adminGroup],
      {},
    );
    expect(columns.map((column) => column.group.id)).toEqual([1, 2, 3, 5, 4]);
    expect(columns.map((column) => column.isAdminGroup)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it("uses the group's permission row and falls back to a disabled permission", () => {
    const permission = createMockMcpGroupPermission({
      group_id: 4,
      tool_access: { search: "no" },
    });
    const columns = buildGridColumns([zebraGroup, alphaGroup], {
      4: permission,
    });
    expect(columns.map((column) => column.permission)).toEqual([
      getDisabledPermission(5),
      permission,
    ]);
  });
});

describe("filterGridColumns", () => {
  const columns = buildGridColumns(
    [adminGroup, allUsersGroup, alphaGroup, zebraGroup],
    {},
  );

  it("returns the input array for an empty or blank query", () => {
    expect(filterGridColumns(columns, "")).toBe(columns);
    expect(filterGridColumns(columns, "   ")).toBe(columns);
  });

  it("matches group names case-insensitively after trimming", () => {
    expect(
      filterGridColumns(columns, "  ALPHA ").map((column) => column.group.name),
    ).toEqual(["Alpha"]);
    expect(
      filterGridColumns(columns, "al").map((column) => column.group.name),
    ).toEqual(["All Users", "Alpha"]);
  });

  it("filters Administrators like any other group", () => {
    expect(
      filterGridColumns(columns, "zebra").map((column) => column.group.name),
    ).toEqual(["zebra"]);
  });
});
