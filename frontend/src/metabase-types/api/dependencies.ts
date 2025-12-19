// IMPORTANT: The field selections in the *DependencyNodeData types below
// MUST be kept in sync with the backend field selections in:
// enterprise/backend/src/metabase_enterprise/dependencies/api.clj
// (See entity-select-fields map)

import type { Card, CardType } from "./card";
import type { Dashboard } from "./dashboard";
import type { Document } from "./document";
import type { Measure } from "./measure";
import type { Segment } from "./segment";
import type { NativeQuerySnippet } from "./snippets";
import type { Table, TableId } from "./table";
import type { Transform } from "./transform";

export type DependencyId = number;
export type DependencyType =
  | "card"
  | "table"
  | "transform"
  | "snippet"
  | "dashboard"
  | "document"
  | "sandbox"
  | "segment"
  | "measure";
export type DependencyGroupType = CardType | Exclude<DependencyType, "card">;

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
};

export type TableDependencyNodeData = Pick<
  Table,
  "name" | "display_name" | "description" | "db_id" | "schema" | "db" | "fields"
>;

export type TransformDependencyNodeData = Pick<
  Transform,
  "name" | "description" | "table"
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
};

export type SnippetDependencyNodeData = Pick<
  NativeQuerySnippet,
  "name" | "description"
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
> & {
  view_count?: number | null;
};

export type DocumentDependencyNodeData = Pick<
  Document,
  "name" | "created_at" | "creator" | "collection_id" | "collection"
> & {
  view_count?: number | null;
};

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
  dependent_type: DependencyType;
  dependent_card_type?: CardType;
  archived?: boolean;
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
