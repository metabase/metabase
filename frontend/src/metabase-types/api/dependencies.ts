// IMPORTANT: The field selections in the *DependencyNodeData types below
// MUST be kept in sync with the backend field selections in:
// enterprise/backend/src/metabase_enterprise/dependencies/api.clj
// (See entity-select-fields map)

import type { Card, CardType } from "./card";
import type { Dashboard } from "./dashboard";
import type { Document } from "./document";
import type { Measure } from "./measure";
import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { Segment } from "./segment";
import type { NativeQuerySnippet } from "./snippets";
import type { SortDirection } from "./sorting";
import type { Table, TableId } from "./table";
import type { Transform } from "./transform";

export type DependencyId = number;

export const DEPENDENCY_TYPES = [
  "card",
  "table",
  "transform",
  "snippet",
  "dashboard",
  "document",
  "sandbox",
  "segment",
  "measure",
] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export const DEPENDENCY_GROUP_TYPES = [
  "question",
  "model",
  "metric",
  "table",
  "transform",
  "snippet",
  "dashboard",
  "document",
  "sandbox",
  "segment",
  "measure",
] as const;
export type DependencyGroupType = (typeof DEPENDENCY_GROUP_TYPES)[number];

export type DependencyEntry = {
  id: DependencyId;
  type: DependencyType;
};

export type DependentsCount = Partial<Record<DependencyGroupType, number>>;

type BaseDependencyNode<TType extends DependencyType, TData> = {
  id: DependencyId;
  type: TType;
  data: TData;
  dependents_count?: DependentsCount | null;
  dependents_errors?: AnalysisFindingError[] | null;
};

export type TableDependencyNodeData = Pick<
  Table,
  | "name"
  | "display_name"
  | "description"
  | "db_id"
  | "schema"
  | "db"
  | "fields"
  | "transform"
  | "owner"
>;

export type TransformDependencyNodeData = Pick<
  Transform,
  "name" | "description" | "table" | "creator" | "created_at" | "owner"
>;

export type CardDependencyNodeData = Pick<
  Card,
  | "name"
  | "description"
  | "type"
  | "display"
  | "database_id"
  | "collection_id"
  | "collection"
  | "dashboard_id"
  | "dashboard"
  | "document_id"
  | "document"
  | "result_metadata"
  | "creator"
  | "created_at"
  | "last-edit-info"
> & {
  view_count?: number | null;
  query_type?: "native" | "query";
};

export type SnippetDependencyNodeData = Pick<
  NativeQuerySnippet,
  | "name"
  | "description"
  | "creator_id"
  | "creator"
  | "created_at"
  | "collection_id"
  | "collection"
>;

export type DashboardDependencyNodeData = Pick<
  Dashboard,
  | "name"
  | "description"
  | "created_at"
  | "creator"
  | "last-edit-info"
  | "collection_id"
  | "collection"
  | "moderation_reviews"
  | "view_count"
>;

export type DocumentDependencyNodeData = Pick<
  Document,
  | "name"
  | "created_at"
  | "creator"
  | "collection_id"
  | "collection"
  | "view_count"
>;

export type SandboxDependencyNodeData = {
  table_id: TableId;
  table?: Table | null;
};

export type TableDependencyNode = BaseDependencyNode<
  "table",
  TableDependencyNodeData
>;

export type TransformDependencyNode = BaseDependencyNode<
  "transform",
  TransformDependencyNodeData
>;

export type CardDependencyNode = BaseDependencyNode<
  "card",
  CardDependencyNodeData
>;

export type SnippetDependencyNode = BaseDependencyNode<
  "snippet",
  SnippetDependencyNodeData
>;

export type DashboardDependencyNode = BaseDependencyNode<
  "dashboard",
  DashboardDependencyNodeData
>;

export type DocumentDependencyNode = BaseDependencyNode<
  "document",
  DocumentDependencyNodeData
>;

export type SandboxDependencyNode = BaseDependencyNode<
  "sandbox",
  SandboxDependencyNodeData
>;

export type SegmentDependencyNodeData = Pick<
  Segment,
  "name" | "description" | "table_id" | "created_at" | "creator_id" | "creator"
> & {
  table?: Table | null;
};

export type SegmentDependencyNode = BaseDependencyNode<
  "segment",
  SegmentDependencyNodeData
>;

export type MeasureDependencyNodeData = Pick<
  Measure,
  "name" | "description" | "table_id" | "created_at" | "creator_id" | "creator"
> & {
  table?: Table | null;
};

export type MeasureDependencyNode = BaseDependencyNode<
  "measure",
  MeasureDependencyNodeData
>;

export type DependencyNode =
  | TableDependencyNode
  | TransformDependencyNode
  | CardDependencyNode
  | SnippetDependencyNode
  | DashboardDependencyNode
  | DocumentDependencyNode
  | SandboxDependencyNode
  | SegmentDependencyNode
  | MeasureDependencyNode;

export type AnalysisFindingErrorId = number;

export const ANALYSIS_FINDING_ERROR_TYPES = [
  "missing-column",
  "missing-table-alias",
  "duplicate-column",
  "syntax-error",
  "validation-error",
] as const;
export type AnalysisFindingErrorType =
  (typeof ANALYSIS_FINDING_ERROR_TYPES)[number];

export type AnalysisFindingError = {
  id: AnalysisFindingErrorId;
  analyzed_entity_id: DependencyId;
  analyzed_entity_type: DependencyType;
  source_entity_id?: DependencyId | null;
  source_entity_type?: DependencyType | null;
  error_type: AnalysisFindingErrorType;
  error_detail?: string | null;
};

export type DependencyEdge = {
  from_entity_id: DependencyId;
  from_entity_type: DependencyType;
  to_entity_id: DependencyId;
  to_entity_type: DependencyType;
};

export type DependencyGraph = {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
};

export type GetDependencyGraphRequest = {
  id: DependencyId;
  type: DependencyType;
};

export type ListNodeDependentsRequest = {
  id: DependencyId;
  type: DependencyType;
  dependent_types?: DependencyType[];
  dependent_card_types?: CardType[];
  query?: string;
  include_personal_collections?: boolean;
  archived?: boolean;
  sort_column?: DependencySortColumn;
  sort_direction?: SortDirection;
};

export type CheckDependenciesResponse = {
  success: boolean;
  bad_cards?: Card[];
  bad_transforms?: Transform[];
};

export type CheckCardDependenciesRequest = Pick<Card, "id"> &
  Partial<Pick<Card, "type" | "dataset_query" | "result_metadata">>;

export type CheckSnippetDependenciesRequest = Pick<NativeQuerySnippet, "id"> &
  Partial<Pick<NativeQuerySnippet, "name" | "content">>;

export type CheckTransformDependenciesRequest = Pick<Transform, "id"> &
  Partial<Pick<Transform, "source">>;

export const DEPENDENCY_SORT_COLUMNS = [
  "name",
  "location",
  "view-count",
  "dependents-errors",
  "dependents-with-errors",
] as const;
export type DependencySortColumn = (typeof DEPENDENCY_SORT_COLUMNS)[number];

export type ListBreakingGraphNodesRequest = PaginationRequest & {
  types?: DependencyType[];
  card_types?: CardType[];
  query?: string;
  include_personal_collections?: boolean;
  sort_column?: DependencySortColumn;
  sort_direction?: SortDirection;
};

export type ListBreakingGraphNodesResponse = PaginationResponse & {
  data: DependencyNode[];
};

export type ListBrokenGraphNodesRequest = {
  id: DependencyId;
  type: DependencyType;
  dependent_types?: DependencyType[];
  dependent_card_types?: CardType[];
  include_personal_collections?: boolean;
  sort_column?: DependencySortColumn;
  sort_direction?: SortDirection;
};

export type ListUnreferencedGraphNodesRequest = PaginationRequest & {
  types?: DependencyType[];
  card_types?: CardType[];
  query?: string;
  include_personal_collections?: boolean;
  sort_column?: DependencySortColumn;
  sort_direction?: SortDirection;
};

export type ListUnreferencedGraphNodesResponse = PaginationResponse & {
  data: DependencyNode[];
};

export type DependencyListUserParams = {
  group_types?: DependencyGroupType[];
  include_personal_collections?: boolean;
  sort_column?: DependencySortColumn;
  sort_direction?: SortDirection;
};
