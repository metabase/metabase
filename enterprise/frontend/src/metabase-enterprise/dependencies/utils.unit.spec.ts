import type { IconName } from "metabase/ui";
import registerVisualizations from "metabase/visualizations/register";
import type {
  AnalysisFindingError,
  AnalysisFindingErrorType,
  DependencyEntry,
  DependencyGroupType,
  DependencyNode,
  DependencyType,
} from "metabase-types/api";
import {
  createMockAnalysisFindingError,
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockCollection,
  createMockDashboardDependencyNode,
  createMockDashboardDependencyNodeData,
  createMockDatabase,
  createMockDocumentDependencyNode,
  createMockDocumentDependencyNodeData,
  createMockMeasureDependencyNode,
  createMockSandboxDependencyNode,
  createMockSegmentDependencyNode,
  createMockSegmentDependencyNodeData,
  createMockSnippetDependencyNode,
  createMockTable,
  createMockTableDependencyNode,
  createMockTableDependencyNodeData,
  createMockTransformDependencyNode,
  createMockUserInfo,
} from "metabase-types/api/mocks";

import type {
  DependencyError,
  DependencyGroupTypeInfo,
  DependentGroup,
  NodeLink,
} from "./types";
import {
  canHaveViewCount,
  getCardType,
  getCardTypes,
  getDependencyErrorGroups,
  getDependencyErrorInfo,
  getDependencyErrors,
  getDependencyGroupIcon,
  getDependencyGroupTitle,
  getDependencyGroupType,
  getDependencyGroupTypeInfo,
  getDependencyType,
  getDependencyTypes,
  getDependentErrorNodesCount,
  getDependentErrorNodesLabel,
  getDependentGroupLabel,
  getDependentGroups,
  getErrorTypeLabel,
  getErrorTypeLabelWithCount,
  getNodeCreatedAt,
  getNodeCreatedBy,
  getNodeDescription,
  getNodeIcon,
  getNodeId,
  getNodeLabel,
  getNodeLastEditedAt,
  getNodeLastEditedBy,
  getNodeLink,
  getNodeLocationInfo,
  getNodeTypeInfo,
  getNodeViewCount,
  getSearchQuery,
  isSameNode,
  parseBoolean,
  parseEnum,
  parseList,
  parseNumber,
  parseString,
} from "./utils";

registerVisualizations();

describe("getNodeIcon", () => {
  it.each<{
    node: DependencyNode;
    expectedIcon: IconName;
  }>([
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "question",
          display: "pie",
          query_type: "query",
        }),
      }),
      expectedIcon: "pie",
    },
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "question",
          display: "table",
          query_type: "native",
        }),
      }),
      expectedIcon: "sql",
    },
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "model",
          display: "table",
        }),
      }),
      expectedIcon: "model",
    },
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "metric",
          display: "scalar",
        }),
      }),
      expectedIcon: "metric",
    },
    {
      node: createMockTableDependencyNode(),
      expectedIcon: "table",
    },
    {
      node: createMockTransformDependencyNode(),
      expectedIcon: "transform",
    },
    {
      node: createMockSnippetDependencyNode(),
      expectedIcon: "snippet",
    },
  ])("should get the $node.type node icon", ({ node, expectedIcon }) => {
    expect(getNodeIcon(node)).toBe(expectedIcon);
  });
});

describe("getNodeLink", () => {
  it.each<{
    node: DependencyNode;
    expectedLink: NodeLink;
  }>([
    {
      node: createMockCardDependencyNode({
        id: 1,
        data: createMockCardDependencyNodeData({
          type: "question",
          name: "My question",
        }),
      }),
      expectedLink: {
        label: "View this question",
        url: "/question/1-my-question",
      },
    },
    {
      node: createMockCardDependencyNode({
        id: 1,
        data: createMockCardDependencyNodeData({
          type: "model",
          name: "My model",
        }),
      }),
      expectedLink: {
        label: "View this model",
        url: "/model/1-my-model",
      },
    },
    {
      node: createMockCardDependencyNode({
        id: 1,
        data: createMockCardDependencyNodeData({
          type: "metric",
          name: "My metric",
        }),
      }),
      expectedLink: {
        label: "View this metric",
        url: "/metric/1-my-metric",
      },
    },
    {
      node: createMockTableDependencyNode({
        id: 1,
        data: createMockTableDependencyNodeData({
          db_id: 2,
          schema: "not public",
        }),
      }),
      expectedLink: {
        label: "View metadata",
        url: "/data-studio/data/database/2/schema/2:not%20public/table/1",
      },
    },
    {
      node: createMockSegmentDependencyNode({
        id: 1,
        data: createMockSegmentDependencyNodeData({
          table: createMockTable({
            id: 1,
            name: "My table",
          }),
        }),
      }),
      expectedLink: {
        label: "View this segment",
        url: "/data-studio/data/database/1/schema/1:public/table/1/segments/1",
      },
    },
  ])("should get the $node.type node link", ({ node, expectedLink }) => {
    expect(getNodeLink(node)).toEqual(expectedLink);
  });
});

describe("getNodeTypeInfo", () => {
  it.each<{
    node: DependencyNode;
    expectedTypeInfo: DependencyGroupTypeInfo;
  }>([
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "question",
          query_type: "native",
        }),
      }),
      expectedTypeInfo: { label: "SQL question", color: "text-secondary" },
    },
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "question",
          query_type: "query",
        }),
      }),
      expectedTypeInfo: { label: "Question", color: "text-secondary" },
    },
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "model",
        }),
      }),
      expectedTypeInfo: { label: "Model", color: "brand" },
    },
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "metric",
        }),
      }),
      expectedTypeInfo: { label: "Metric", color: "summarize" },
    },
    {
      node: createMockTableDependencyNode(),
      expectedTypeInfo: { label: "Table", color: "brand" },
    },
    {
      node: createMockSnippetDependencyNode(),
      expectedTypeInfo: { label: "Snippet", color: "text-secondary" },
    },
  ])(
    "should get the $node.type node type info",
    ({ node, expectedTypeInfo }) => {
      expect(getNodeTypeInfo(node)).toEqual(expectedTypeInfo);
    },
  );
});

describe("isSameNode", () => {
  it.each<{
    entry1: DependencyEntry;
    entry2: DependencyEntry;
    expected: boolean;
  }>([
    {
      entry1: { id: 1, type: "card" },
      entry2: { id: 1, type: "card" },
      expected: true,
    },
    {
      entry1: { id: 1, type: "card" },
      entry2: { id: 2, type: "card" },
      expected: false,
    },
    {
      entry1: { id: 1, type: "card" },
      entry2: { id: 1, type: "table" },
      expected: false,
    },
  ])("should compare nodes correctly", ({ entry1, entry2, expected }) => {
    expect(isSameNode(entry1, entry2)).toBe(expected);
  });
});

describe("getNodeId", () => {
  it.each<{ id: number; type: DependencyType; expected: string }>([
    { id: 1, type: "card", expected: "1-card" },
    { id: 42, type: "table", expected: "42-table" },
    { id: 100, type: "dashboard", expected: "100-dashboard" },
  ])("should generate node id for $type", ({ id, type, expected }) => {
    expect(getNodeId(id, type)).toBe(expected);
  });
});

describe("getNodeLabel", () => {
  it.each<{ node: DependencyNode; expected: string }>([
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({ name: "My Card" }),
      }),
      expected: "My Card",
    },
    {
      node: createMockTableDependencyNode({
        data: createMockTableDependencyNodeData({ display_name: "My Table" }),
      }),
      expected: "My Table",
    },
    {
      node: createMockSandboxDependencyNode({
        data: {
          table_id: 1,
          table: createMockTable({ display_name: "Sandboxed Table" }),
        },
      }),
      expected: "Sandboxed Table",
    },
    {
      node: createMockSandboxDependencyNode({ data: { table_id: 1 } }),
      expected: "Row and column security rule",
    },
  ])("should get label for $node.type", ({ node, expected }) => {
    expect(getNodeLabel(node)).toBe(expected);
  });
});

describe("getNodeDescription", () => {
  it.each<{ node: DependencyNode; expected: string | null }>([
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          description: "Card description",
        }),
      }),
      expected: "Card description",
    },
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({ description: null }),
      }),
      expected: "",
    },
    {
      node: createMockDocumentDependencyNode(),
      expected: null,
    },
    {
      node: createMockSandboxDependencyNode(),
      expected: null,
    },
  ])("should get description for $node.type", ({ node, expected }) => {
    expect(getNodeDescription(node)).toBe(expected);
  });
});

describe("getNodeLocationInfo", () => {
  it("should return dashboard location for card in dashboard", () => {
    const node = createMockCardDependencyNode({
      data: createMockCardDependencyNodeData({
        dashboard: { id: 1, name: "My Dashboard" },
      }),
    });
    const result = getNodeLocationInfo(node);
    expect(result?.icon).toBe("dashboard");
    expect(result?.links[0].label).toBe("My Dashboard");
  });

  it("should return document location for card in document", () => {
    const node = createMockCardDependencyNode({
      data: createMockCardDependencyNodeData({
        dashboard: null,
        document: { id: 1, name: "My Document" },
      }),
    });
    const result = getNodeLocationInfo(node);
    expect(result?.icon).toBe("document");
    expect(result?.links[0].label).toBe("My Document");
  });

  it("should return collection location for card in collection", () => {
    const node = createMockCardDependencyNode({
      data: createMockCardDependencyNodeData({
        dashboard: null,
        collection: createMockCollection({ name: "My Collection" }),
      }),
    });
    const result = getNodeLocationInfo(node);
    expect(result?.icon).toBe("collection");
    expect(result?.links[0].label).toBe("My Collection");
  });

  it("should return database location for table", () => {
    const node = createMockTableDependencyNode({
      data: createMockTableDependencyNodeData({
        db: createMockDatabase({ id: 1, name: "My Database" }),
        db_id: 1,
        schema: "public",
      }),
    });
    const result = getNodeLocationInfo(node);
    expect(result?.icon).toBe("database");
    expect(result?.links[0].label).toBe("My Database");
    expect(result?.links[1].label).toBe("public");
  });

  it("should return null for sandbox", () => {
    const node = createMockSandboxDependencyNode();
    expect(getNodeLocationInfo(node)).toBeNull();
  });

  it("should return null for transform", () => {
    const node = createMockTransformDependencyNode();
    expect(getNodeLocationInfo(node)).toBeNull();
  });
});

describe("getNodeCreatedAt", () => {
  it.each<{ node: DependencyNode; expected: string | null }>([
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          created_at: "2020-01-01T00:00:00Z",
        }),
      }),
      expected: "2020-01-01T00:00:00Z",
    },
    {
      node: createMockTableDependencyNode(),
      expected: null,
    },
    {
      node: createMockSandboxDependencyNode(),
      expected: null,
    },
  ])("should get created_at for $node.type", ({ node, expected }) => {
    expect(getNodeCreatedAt(node)).toBe(expected);
  });
});

describe("getNodeCreatedBy", () => {
  it("should return creator for card", () => {
    const creator = createMockUserInfo({ common_name: "Test User" });
    const node = createMockCardDependencyNode({
      data: createMockCardDependencyNodeData({ creator }),
    });
    expect(getNodeCreatedBy(node)).toEqual(creator);
  });

  it("should return null for table", () => {
    const node = createMockTableDependencyNode();
    expect(getNodeCreatedBy(node)).toBeNull();
  });
});

describe("getNodeLastEditedAt", () => {
  it("should return last edit timestamp for card", () => {
    const node = createMockCardDependencyNode({
      data: createMockCardDependencyNodeData({
        "last-edit-info": {
          id: 1,
          email: "test@example.com",
          first_name: "Test",
          last_name: "User",
          timestamp: "2020-06-01T00:00:00Z",
        },
      }),
    });
    expect(getNodeLastEditedAt(node)).toBe("2020-06-01T00:00:00Z");
  });

  it("should return null for table", () => {
    const node = createMockTableDependencyNode();
    expect(getNodeLastEditedAt(node)).toBeNull();
  });
});

describe("getNodeLastEditedBy", () => {
  it("should return last edit info for card", () => {
    const lastEditInfo = {
      id: 1,
      email: "test@example.com",
      first_name: "Test",
      last_name: "User",
      timestamp: "2020-06-01T00:00:00Z",
    };
    const node = createMockCardDependencyNode({
      data: createMockCardDependencyNodeData({
        "last-edit-info": lastEditInfo,
      }),
    });
    expect(getNodeLastEditedBy(node)).toEqual(lastEditInfo);
  });

  it("should return null for snippet", () => {
    const node = createMockSnippetDependencyNode();
    expect(getNodeLastEditedBy(node)).toBeNull();
  });
});

describe("canHaveViewCount", () => {
  it.each<{ type: DependencyType; expected: boolean }>([
    { type: "card", expected: true },
    { type: "dashboard", expected: true },
    { type: "document", expected: true },
    { type: "table", expected: false },
    { type: "transform", expected: false },
    { type: "segment", expected: false },
    { type: "measure", expected: false },
    { type: "snippet", expected: false },
    { type: "sandbox", expected: false },
  ])("should return $expected for $type", ({ type, expected }) => {
    expect(canHaveViewCount(type)).toBe(expected);
  });
});

describe("getNodeViewCount", () => {
  it.each<{ node: DependencyNode; expected: number | null }>([
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "question",
          view_count: 100,
        }),
      }),
      expected: 100,
    },
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "model",
          view_count: 100,
        }),
      }),
      expected: 100,
    },
    {
      node: createMockDashboardDependencyNode({
        data: createMockDashboardDependencyNodeData({
          view_count: 50,
        }),
      }),
      expected: 50,
    },
    {
      node: createMockDocumentDependencyNode({
        data: createMockDocumentDependencyNodeData({
          view_count: 25,
        }),
      }),
      expected: 25,
    },
    {
      node: createMockTableDependencyNode(),
      expected: null,
    },
  ])("should return view count for $node.type", ({ node, expected }) => {
    expect(getNodeViewCount(node)).toBe(expected);
  });
});

describe("getCardType", () => {
  it.each<{ groupType: DependencyGroupType; expected: string | null }>([
    { groupType: "question", expected: "question" },
    { groupType: "model", expected: "model" },
    { groupType: "metric", expected: "metric" },
    { groupType: "table", expected: null },
    { groupType: "dashboard", expected: null },
  ])("should get card type for $groupType", ({ groupType, expected }) => {
    expect(getCardType(groupType)).toBe(expected);
  });
});

describe("getDependencyType", () => {
  it.each<{ groupType: DependencyGroupType; expected: string }>([
    { groupType: "question", expected: "card" },
    { groupType: "model", expected: "card" },
    { groupType: "metric", expected: "card" },
    { groupType: "table", expected: "table" },
    { groupType: "dashboard", expected: "dashboard" },
    { groupType: "transform", expected: "transform" },
  ])("should get dependency type for $groupType", ({ groupType, expected }) => {
    expect(getDependencyType(groupType)).toBe(expected);
  });
});

describe("getDependencyGroupType", () => {
  it.each<{ node: DependencyNode; expected: DependencyGroupType }>([
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({ type: "question" }),
      }),
      expected: "question",
    },
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({ type: "model" }),
      }),
      expected: "model",
    },
    {
      node: createMockTableDependencyNode(),
      expected: "table",
    },
    {
      node: createMockDashboardDependencyNode(),
      expected: "dashboard",
    },
    {
      node: createMockMeasureDependencyNode(),
      expected: "measure",
    },
  ])("should get group type for $node.type", ({ node, expected }) => {
    expect(getDependencyGroupType(node)).toBe(expected);
  });
});

describe("getDependencyGroupTypeInfo", () => {
  it.each<{
    groupType: DependencyGroupType;
    expected: DependencyGroupTypeInfo;
  }>([
    {
      groupType: "question",
      expected: { label: "Question", color: "text-secondary" },
    },
    { groupType: "model", expected: { label: "Model", color: "brand" } },
    { groupType: "metric", expected: { label: "Metric", color: "summarize" } },
    { groupType: "table", expected: { label: "Table", color: "brand" } },
    {
      groupType: "dashboard",
      expected: { label: "Dashboard", color: "filter" },
    },
    {
      groupType: "sandbox",
      expected: { label: "Row and column security rule", color: "error" },
    },
  ])("should get type info for $groupType", ({ groupType, expected }) => {
    expect(getDependencyGroupTypeInfo(groupType)).toEqual(expected);
  });
});

describe("getDependencyGroupIcon", () => {
  it.each<{ groupType: DependencyGroupType; expected: IconName }>([
    { groupType: "question", expected: "table2" },
    { groupType: "model", expected: "model" },
    { groupType: "metric", expected: "metric" },
    { groupType: "table", expected: "table" },
    { groupType: "dashboard", expected: "dashboard" },
    { groupType: "transform", expected: "transform" },
  ])("should get icon for $groupType", ({ groupType, expected }) => {
    expect(getDependencyGroupIcon(groupType)).toBe(expected);
  });
});

describe("getDependencyTypes", () => {
  it("should convert group types to dependency types", () => {
    const groupTypes: DependencyGroupType[] = ["question", "model", "table"];
    expect(getDependencyTypes(groupTypes)).toEqual(["card", "table"]);
  });

  it("should deduplicate card types", () => {
    const groupTypes: DependencyGroupType[] = ["question", "model", "metric"];
    expect(getDependencyTypes(groupTypes)).toEqual(["card"]);
  });
});

describe("getCardTypes", () => {
  it("should extract card types from group types", () => {
    const groupTypes: DependencyGroupType[] = ["question", "model", "table"];
    expect(getCardTypes(groupTypes)).toEqual(["question", "model"]);
  });

  it("should return empty array for non-card types", () => {
    const groupTypes: DependencyGroupType[] = ["table", "dashboard"];
    expect(getCardTypes(groupTypes)).toEqual([]);
  });
});

describe("getDependentGroups", () => {
  it("should return non-zero dependent groups", () => {
    const node = createMockCardDependencyNode({
      dependents_count: { question: 5, model: 3, table: 0 },
    });
    const result = getDependentGroups(node);
    expect(result).toEqual([
      { type: "question", count: 5 },
      { type: "model", count: 3 },
    ]);
  });

  it("should return empty array when no dependents", () => {
    const node = createMockCardDependencyNode({ dependents_count: {} });
    expect(getDependentGroups(node)).toEqual([]);
  });
});

describe("getDependencyGroupTitle", () => {
  it('should return "Restricts table data" for sandbox', () => {
    const node = createMockSandboxDependencyNode();
    expect(getDependencyGroupTitle(node, [])).toBe("Restricts table data");
  });

  it('should return "Nothing uses this" when no groups', () => {
    const node = createMockCardDependencyNode();
    expect(getDependencyGroupTitle(node, [])).toBe("Nothing uses this");
  });

  it('should return "Generates" for transform', () => {
    const node = createMockTransformDependencyNode();
    const groups: DependentGroup[] = [{ type: "table", count: 1 }];
    expect(getDependencyGroupTitle(node, groups)).toBe("Generates");
  });

  it('should return "Used by" for other types with dependents', () => {
    const node = createMockCardDependencyNode();
    const groups: DependentGroup[] = [{ type: "question", count: 5 }];
    expect(getDependencyGroupTitle(node, groups)).toBe("Used by");
  });
});

describe("getDependentGroupLabel", () => {
  it.each<{ type: DependencyGroupType; count: number; expected: string }>([
    { type: "question", count: 1, expected: "1 question" },
    { type: "question", count: 5, expected: "5 questions" },
    { type: "model", count: 1, expected: "1 model" },
    { type: "model", count: 3, expected: "3 models" },
    { type: "dashboard", count: 1, expected: "1 dashboard" },
    { type: "dashboard", count: 2, expected: "2 dashboards" },
  ])("should format $count $type", ({ type, count, expected }) => {
    expect(getDependentGroupLabel({ type, count })).toBe(expected);
  });
});

describe("getErrorTypeLabel", () => {
  it.each<{ type: AnalysisFindingErrorType; count: number; expected: string }>([
    { type: "missing-column", count: 1, expected: "Missing column" },
    { type: "missing-column", count: 2, expected: "Missing columns" },
    { type: "syntax-error", count: 1, expected: "Syntax error" },
    { type: "duplicate-column", count: 3, expected: "Duplicate columns" },
  ])("should format $type with count $count", ({ type, count, expected }) => {
    expect(getErrorTypeLabel(type, count)).toBe(expected);
  });
});

describe("getErrorTypeLabelWithCount", () => {
  it.each<{ type: AnalysisFindingErrorType; count: number; expected: string }>([
    { type: "missing-column", count: 1, expected: "1 missing column" },
    { type: "missing-column", count: 3, expected: "3 missing columns" },
    { type: "syntax-error", count: 2, expected: "2 syntax errors" },
  ])("should format $count $type", ({ type, count, expected }) => {
    expect(getErrorTypeLabelWithCount(type, count)).toBe(expected);
  });
});

describe("getDependencyErrors", () => {
  it("should deduplicate errors by type and detail", () => {
    const errors: AnalysisFindingError[] = [
      createMockAnalysisFindingError({
        id: 1,
        error_detail: "column_a",
      }),
      createMockAnalysisFindingError({
        id: 2,
        error_detail: "column_a",
      }),
      createMockAnalysisFindingError({
        id: 3,
        error_detail: "column_b",
      }),
    ];
    const result = getDependencyErrors(errors);
    expect(result).toEqual([
      { type: "missing-column", detail: "column_a" },
      { type: "missing-column", detail: "column_b" },
    ]);
  });
});

describe("getDependencyErrorGroups", () => {
  it("should group errors by type", () => {
    const errors: DependencyError[] = [
      { type: "missing-column", detail: "col_a" },
      { type: "missing-column", detail: "col_b" },
      { type: "syntax-error", detail: "invalid" },
    ];
    const result = getDependencyErrorGroups(errors);
    expect(result).toEqual([
      {
        type: "missing-column",
        errors: [
          { type: "missing-column", detail: "col_a" },
          { type: "missing-column", detail: "col_b" },
        ],
      },
      {
        type: "syntax-error",
        errors: [{ type: "syntax-error", detail: "invalid" }],
      },
    ]);
  });
});

describe("getDependencyErrorInfo", () => {
  it("should return undefined for empty errors", () => {
    expect(getDependencyErrorInfo([])).toBeUndefined();
  });

  it("should return single error info with detail", () => {
    const errors: DependencyError[] = [
      { type: "missing-column", detail: "column_name" },
    ];
    const result = getDependencyErrorInfo(errors);
    expect(result).toEqual({
      label: "Missing column",
      detail: "column_name",
    });
  });

  it("should return count for multiple errors of same type", () => {
    const errors: DependencyError[] = [
      { type: "missing-column", detail: "col_a" },
      { type: "missing-column", detail: "col_b" },
    ];
    const result = getDependencyErrorInfo(errors);
    expect(result).toEqual({
      label: "2 missing columns",
      detail: null,
    });
  });

  it("should return generic count for multiple error types", () => {
    const errors: DependencyError[] = [
      { type: "missing-column", detail: "col_a" },
      { type: "syntax-error", detail: "invalid" },
    ];
    const result = getDependencyErrorInfo(errors);
    expect(result).toEqual({
      label: "2 problems",
      detail: null,
    });
  });
});

describe("getDependentErrorNodesCount", () => {
  it("should count unique nodes with errors", () => {
    const errors: AnalysisFindingError[] = [
      createMockAnalysisFindingError({
        id: 1,
        analyzed_entity_id: 1,
        error_detail: "col_a",
      }),
      createMockAnalysisFindingError({
        id: 2,
        analyzed_entity_id: 1,
        error_detail: "col_b",
      }),
      createMockAnalysisFindingError({
        id: 3,
        analyzed_entity_id: 2,
        error_detail: "col_a",
      }),
    ];
    expect(getDependentErrorNodesCount(errors)).toBe(2);
  });
});

describe("parseString", () => {
  it.each([
    { value: "hello", expected: "hello" },
    { value: "", expected: "" },
    { value: 123, expected: undefined },
    { value: null, expected: undefined },
    { value: undefined, expected: undefined },
  ])("should parse $value", ({ value, expected }) => {
    expect(parseString(value)).toBe(expected);
  });
});

describe("parseNumber", () => {
  it.each<{ value: unknown; expected: number | undefined }>([
    { value: "123", expected: 123 },
    { value: "3.14", expected: 3.14 },
    { value: "abc", expected: undefined },
    { value: "", expected: undefined },
    { value: "   ", expected: undefined },
    { value: 123, expected: undefined },
  ])("should parse $value", ({ value, expected }) => {
    expect(parseNumber(value)).toBe(expected);
  });
});

describe("parseBoolean", () => {
  it.each([
    { value: "true", expected: true },
    { value: "false", expected: false },
    { value: "yes", expected: undefined },
    { value: true, expected: undefined },
    { value: null, expected: undefined },
  ])("should parse $value", ({ value, expected }) => {
    expect(parseBoolean(value)).toBe(expected);
  });
});

describe("parseEnum", () => {
  const items: readonly string[] = ["a", "b", "c"];

  it.each<{ value: unknown; expected: string | undefined }>([
    { value: "a", expected: "a" },
    { value: "b", expected: "b" },
    { value: "d", expected: undefined },
    { value: 123, expected: undefined },
  ])("should parse $value", ({ value, expected }) => {
    expect(parseEnum(value, items)).toBe(expected);
  });
});

describe("parseList", () => {
  it("should parse array of strings", () => {
    const result = parseList(["a", "b"], parseString);
    expect(result).toEqual(["a", "b"]);
  });

  it("should wrap single value in array", () => {
    const result = parseList("single", parseString);
    expect(result).toEqual(["single"]);
  });

  it("should filter out invalid items", () => {
    const result = parseList(["a", 123, "b"], parseString);
    expect(result).toEqual(["a", "b"]);
  });

  it("should return undefined for null/undefined", () => {
    expect(parseList(null, parseString)).toBeUndefined();
    expect(parseList(undefined, parseString)).toBeUndefined();
  });
});

describe("getSearchQuery", () => {
  it.each([
    { value: "search term", expected: "search term" },
    { value: "  trimmed  ", expected: "trimmed" },
    { value: "", expected: undefined },
    { value: "   ", expected: undefined },
  ])("should process '$value'", ({ value, expected }) => {
    expect(getSearchQuery(value)).toBe(expected);
  });
});

describe("getDependentErrorNodesLabel", () => {
  it.each<{ count: number; expected: string }>([
    { count: 0, expected: "Broken dependents" },
    { count: 1, expected: "Broken dependent" },
    { count: 2, expected: "Broken dependents" },
    { count: 10, expected: "Broken dependents" },
  ])("should return '$expected' for count $count", ({ count, expected }) => {
    expect(getDependentErrorNodesLabel(count)).toBe(expected);
  });

  it("should default to plural form when called without arguments", () => {
    expect(getDependentErrorNodesLabel()).toBe("Broken dependents");
  });
});
