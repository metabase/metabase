import type { Card, CardType } from "./card";
import type { NativeQuerySnippet } from "./snippets";
import type { Table } from "./table";
import type { Transform } from "./transform";

export type DependencyId = number;

export type DependencyType = CardType | "table" | "transform" | "snippet";

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

type BaseDependentNode<TType, TData> = {
  id: DependencyId;
  type: TType;
  data: TData;
};

export type TableDependencyNodeData = Pick<
  Table,
  "name" | "display_name" | "db_id" | "schema"
>;

export type TableDependentNodeData = TableDependencyNodeData;

export type TransformDependencyNodeData = Pick<Transform, "name">;

export type TransformDependentNodeData = TransformDependencyNodeData;

export type CardDependencyNodeData = Pick<
  Card,
  "name" | "display" | "database_id"
>;

export type CardDependentNodeData = CardDependencyNodeData &
  Pick<Card, "collection_id" | "collection" | "database_id" | "dashboard">;

export type SnippetDependencyNodeData = Pick<NativeQuerySnippet, "name">;

export type SnippetDependentNodeData = SnippetDependencyNodeData;

export type TableDependencyNode = BaseDependencyNode<
  "table",
  TableDependencyNodeData
>;

export type TableDependentNode = BaseDependencyNode<
  "table",
  TableDependentNodeData
>;

export type TransformDependencyNode = BaseDependencyNode<
  "transform",
  TransformDependencyNodeData
>;

export type TransformDependentNode = BaseDependentNode<
  "transform",
  TransformDependentNodeData
>;

type CardDependencyNode<TType> = BaseDependencyNode<
  TType,
  CardDependencyNodeData
>;

type CardDependentNode<TType> = BaseDependentNode<TType, CardDependentNodeData>;

export type QuestionDependencyNode = CardDependencyNode<"question">;

export type QuestionDependentNode = CardDependentNode<"question">;

export type ModelDependencyNode = CardDependencyNode<"model">;

export type ModelDependentNode = CardDependentNode<"model">;

export type MetricDependencyNode = CardDependencyNode<"metric">;

export type MetricDependentNode = CardDependentNode<"metric">;

export type SnippetDependencyNode = BaseDependencyNode<
  "snippet",
  SnippetDependencyNodeData
>;

export type SnippetDependentNode = BaseDependentNode<
  "snippet",
  SnippetDependentNodeData
>;

export type DependencyNode =
  | TableDependencyNode
  | TransformDependencyNode
  | QuestionDependencyNode
  | ModelDependencyNode
  | MetricDependencyNode
  | SnippetDependencyNode;

export type DependentNode =
  | TableDependentNode
  | TransformDependentNode
  | QuestionDependentNode
  | ModelDependentNode
  | MetricDependentNode
  | SnippetDependentNode;

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
