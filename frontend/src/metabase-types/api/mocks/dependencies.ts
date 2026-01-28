import type {
  AnalysisFindingError,
  CardDependencyNode,
  CardDependencyNodeData,
  CheckCardDependenciesRequest,
  CheckDependenciesResponse,
  CheckSnippetDependenciesRequest,
  CheckTransformDependenciesRequest,
  DashboardDependencyNode,
  DashboardDependencyNodeData,
  DependencyEdge,
  DependencyEntry,
  DependencyGraph,
  DocumentDependencyNode,
  DocumentDependencyNodeData,
  ListBrokenGraphNodesRequest,
  ListBrokenGraphNodesResponse,
  ListUnreferencedGraphNodesRequest,
  ListUnreferencedGraphNodesResponse,
  MeasureDependencyNode,
  MeasureDependencyNodeData,
  SandboxDependencyNode,
  SandboxDependencyNodeData,
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

export function createMockAnalysisFindingError(
  opts?: Partial<AnalysisFindingError>,
): AnalysisFindingError {
  return {
    id: 1,
    analyzed_entity_id: 1,
    analyzed_entity_type: "card",
    error_type: "missing-column",
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
    created_at: "2020-01-01T00:00:00Z",
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
    query_type: "query",
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
    created_at: "2020-01-01T00:00:00Z",
    creator_id: 1,
    collection_id: null,
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

export function createMockDashboardDependencyNodeData(
  opts?: Partial<DashboardDependencyNodeData>,
): DashboardDependencyNodeData {
  return {
    name: "Dashboard",
    description: null,
    created_at: "2020-01-01T00:00:00Z",
    collection_id: null,
    moderation_reviews: [],
    ...opts,
  } as DashboardDependencyNodeData;
}

export function createMockDashboardDependencyNode(
  opts?: Partial<DashboardDependencyNode>,
): DashboardDependencyNode {
  return {
    id: 1,
    type: "dashboard",
    data: createMockDashboardDependencyNodeData(),
    dependents_count: {},
    ...opts,
  };
}

export function createMockDocumentDependencyNodeData(
  opts?: Partial<DocumentDependencyNodeData>,
): DocumentDependencyNodeData {
  return {
    name: "Document",
    created_at: "2020-01-01T00:00:00Z",
    collection_id: null,
    ...opts,
  } as DocumentDependencyNodeData;
}

export function createMockDocumentDependencyNode(
  opts?: Partial<DocumentDependencyNode>,
): DocumentDependencyNode {
  return {
    id: 1,
    type: "document",
    data: createMockDocumentDependencyNodeData(),
    dependents_count: {},
    ...opts,
  };
}

export function createMockSandboxDependencyNodeData(
  opts?: Partial<SandboxDependencyNodeData>,
): SandboxDependencyNodeData {
  return {
    table_id: 1,
    ...opts,
  };
}

export function createMockSandboxDependencyNode(
  opts?: Partial<SandboxDependencyNode>,
): SandboxDependencyNode {
  return {
    id: 1,
    type: "sandbox",
    data: createMockSandboxDependencyNodeData(),
    dependents_count: {},
    ...opts,
  };
}

export function createMockMeasureDependencyNodeData(
  opts?: Partial<MeasureDependencyNodeData>,
): MeasureDependencyNodeData {
  return {
    name: "Measure",
    description: null,
    table_id: 1,
    created_at: "2020-01-01T00:00:00Z",
    creator_id: 1,
    ...opts,
  };
}

export function createMockMeasureDependencyNode(
  opts?: Partial<MeasureDependencyNode>,
): MeasureDependencyNode {
  return {
    id: 1,
    type: "measure",
    data: createMockMeasureDependencyNodeData(),
    dependents_count: {},
    ...opts,
  };
}

export function createMockListBrokenGraphNodesRequest(
  opts?: Partial<ListBrokenGraphNodesRequest>,
): ListBrokenGraphNodesRequest {
  return {
    ...opts,
  };
}

export function createMockListBrokenGraphNodesResponse(
  opts?: Partial<ListBrokenGraphNodesResponse>,
): ListBrokenGraphNodesResponse {
  return {
    data: [],
    total: 0,
    limit: null,
    offset: null,
    ...opts,
  };
}

export function createMockListUnreferencedGraphNodesRequest(
  opts?: Partial<ListUnreferencedGraphNodesRequest>,
): ListUnreferencedGraphNodesRequest {
  return {
    ...opts,
  };
}

export function createMockListUnreferencedGraphNodesResponse(
  opts?: Partial<ListUnreferencedGraphNodesResponse>,
): ListUnreferencedGraphNodesResponse {
  return {
    data: [],
    total: 0,
    limit: null,
    offset: null,
    ...opts,
  };
}
