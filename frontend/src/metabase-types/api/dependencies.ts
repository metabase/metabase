import type { Card, CardType } from "./card";
import type { NativeQuerySnippet } from "./snippets";
import type { Table } from "./table";
import type { Transform } from "./transform";

export type DependencyId = number;

export type DependencyType = CardType | "transform" | "snippet";

export type DependencyEntry = {
  id: DependencyId;
  type: DependencyType;
};

export type DependencyUsageStats = Partial<Record<DependencyType, number>>;

type BaseDependencyNode<TType, TData> = {
  id: DependencyId;
  type: TType;
  data: TData;
  usage_stats?: DependencyUsageStats;
};

type BaseDependentItem<TType, TData> = {
  id: DependencyId;
  type: TType;
  data: TData;
};

export type TableDependencyNodeData = Pick<
  Table,
  "name" | "display_name" | "db_id" | "schema"
>;

export type TableDependentItemData = TableDependencyNodeData;

export type TransformDependencyNodeData = Pick<Transform, "name">;

export type TransformDependentItemData = TransformDependencyNodeData;

export type CardDependencyNodeData = Pick<
  Card,
  "name" | "display" | "database_id"
>;

export type CardDependentItemData = CardDependencyNodeData &
  Pick<Card, "collection_id" | "collection" | "database_id" | "dashboard">;

export type SnippetDependencyNodeData = Pick<NativeQuerySnippet, "name">;

export type SnippetDependentItemData = SnippetDependencyNodeData;

export type TableDependencyNode = BaseDependencyNode<
  "table",
  TableDependencyNodeData
>;

export type TableDependentItem = BaseDependencyNode<
  "table",
  TableDependentItemData
>;

export type TransformDependencyNode = BaseDependencyNode<
  "transform",
  TransformDependencyNodeData
>;

export type TransformDependentItem = BaseDependentItem<
  "transform",
  TransformDependentItemData
>;

export type CardDependencyNode = BaseDependencyNode<
  "card",
  CardDependencyNodeData
>;

export type CardDependentItem = BaseDependentItem<
  "card",
  CardDependentItemData
>;

export type SnippetDependencyNode = BaseDependencyNode<
  "snippet",
  SnippetDependencyNodeData
>;

export type SnippetDependentItem = BaseDependentItem<
  "snippet",
  SnippetDependentItemData
>;

export type DependencyNode =
  | TableDependencyNode
  | TransformDependencyNode
  | CardDependencyNode
  | SnippetDependencyNode;

export type DependentItem =
  | TableDependentItem
  | TransformDependentItem
  | CardDependentItem
  | SnippetDependentItem;

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

export type ListDependentsRequest = {
  id: DependencyId;
  type: DependencyType;
  dependent_type: DependencyType;
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
