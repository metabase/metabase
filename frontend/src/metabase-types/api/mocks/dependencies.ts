import type {
  CardDependencyNode,
  CardDependencyNodeData,
  CheckCardDependenciesRequest,
  CheckDependenciesResponse,
  CheckSnippetDependenciesRequest,
  CheckTransformDependenciesRequest,
  DependencyEdge,
  DependencyEntry,
  DependencyGraph,
  SegmentDependencyNode,
  SegmentDependencyNodeData,
  SnippetDependencyNode,
  SnippetDependencyNodeData,
  TableDependencyNode,
  TableDependencyNodeData,
  TransformDependencyNode,
  TransformDependencyNodeData,
} from "metabase-types/api";

export function createMockDependencyEntry(
  opts?: Partial<DependencyEntry>,
): DependencyEntry {
  return {
    id: 1,
    type: "table",
    ...opts,
  };
}

export function createMockTableDependencyNodeData(
  opts?: Partial<TableDependencyNodeData>,
): TableDependencyNodeData {
  return {
    name: "table",
    display_name: "Table",
    description: null,
    db_id: 1,
    schema: "public",
    ...opts,
  };
}

export function createMockTransformDependencyNodeData(
  opts?: Partial<TransformDependencyNodeData>,
): TransformDependencyNodeData {
  return {
    name: "Transform",
    description: null,
    ...opts,
  };
}

export function createMockCardDependencyNodeData(
  opts?: Partial<CardDependencyNodeData>,
): CardDependencyNodeData {
  return {
    name: "Card",
    description: null,
    type: "question",
    display: "table",
    dashboard_id: 1,
    collection_id: null,
    result_metadata: [],
    dashboard: null,
    created_at: "2020-01-01T00:00:00Z",
    ...opts,
  };
}

export function createMockTableDependencyNode(
  opts?: Partial<TableDependencyNode>,
): TableDependencyNode {
  return {
    id: 1,
    type: "table",
    data: createMockTableDependencyNodeData(),
    dependents_count: {},
    ...opts,
  };
}

export function createMockCardDependencyNode(
  opts?: Partial<CardDependencyNode>,
): CardDependencyNode {
  return {
    id: 1,
    type: "card",
    data: createMockCardDependencyNodeData(),
    dependents_count: {},
    ...opts,
  };
}

export function createMockTransformDependencyNode(
  opts?: Partial<TransformDependencyNode>,
): TransformDependencyNode {
  return {
    id: 1,
    type: "transform",
    data: createMockTransformDependencyNodeData(),
    dependents_count: {},
    ...opts,
  };
}

export function createMockSnippetDependencyNode(
  opts?: Partial<SnippetDependencyNode>,
): SnippetDependencyNode {
  return {
    id: 1,
    type: "snippet",
    data: createMockSnippetDependencyNodeData(),
    dependents_count: {},
    ...opts,
  };
}

export function createMockDependencyEdge(
  opts?: Partial<DependencyEdge>,
): DependencyEdge {
  return {
    from_entity_id: 1,
    from_entity_type: "card",
    to_entity_id: 1,
    to_entity_type: "table",
    ...opts,
  };
}

export function createMockDependencyGraph(
  opts?: Partial<DependencyGraph>,
): DependencyGraph {
  return {
    nodes: [],
    edges: [],
    ...opts,
  };
}

export function createMockSnippetDependencyNodeData(
  opts?: Partial<SnippetDependencyNodeData>,
): SnippetDependencyNodeData {
  return {
    name: "Snippet",
    description: null,
    ...opts,
  };
}

export function createMockSegmentDependencyNodeData(
  opts?: Partial<SegmentDependencyNodeData>,
): SegmentDependencyNodeData {
  return {
    name: "Segment",
    description: "",
    table_id: 1,
    created_at: "2020-01-01T00:00:00Z",
    creator_id: 1,
    ...opts,
  };
}

export function createMockSegmentDependencyNode(
  opts?: Partial<SegmentDependencyNode>,
): SegmentDependencyNode {
  return {
    id: 1,
    type: "segment",
    data: createMockSegmentDependencyNodeData(),
    dependents_count: {},
    ...opts,
  };
}

export function createMockCheckCardDependenciesRequest(
  opts?: Partial<CheckCardDependenciesRequest>,
): CheckCardDependenciesRequest {
  return {
    id: 1,
    ...opts,
  };
}

export function createMockCheckSnippetDependenciesRequest(
  opts?: Partial<CheckSnippetDependenciesRequest>,
): CheckSnippetDependenciesRequest {
  return {
    id: 1,
    ...opts,
  };
}

export function createMockCheckTransformDependenciesRequest(
  opts?: Partial<CheckTransformDependenciesRequest>,
): CheckTransformDependenciesRequest {
  return {
    id: 1,
    ...opts,
  };
}

export function createMockCheckDependenciesResponse(
  opts?: Partial<CheckDependenciesResponse>,
): CheckDependenciesResponse {
  return {
    success: true,
    ...opts,
  };
}
