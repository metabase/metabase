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

export type DependencyGraphNodeUsageStats = Partial<
  Record<DependencyType, number>
>;

type BaseDependencyGraphNode<TType, TData> = {
  id: DependencyId;
  type: TType;
  data: TData;
  usage_stats?: DependencyGraphNodeUsageStats;
};

export type TableDependencyGraphData = Pick<
  Table,
  "name" | "display_name" | "db_id" | "schema"
>;

export type TransformDependencyGraphData = Pick<Transform, "name">;

export type CardDependencyGraphData = Pick<
  Card,
  "name" | "display" | "database_id"
>;

export type SnippetDependencyGraphData = Pick<NativeQuerySnippet, "name">;

export type TableDependencyGraphNode = BaseDependencyGraphNode<
  "table",
  TableDependencyGraphData
>;

export type TransformDependencyGraphNode = BaseDependencyGraphNode<
  "transform",
  TransformDependencyGraphData
>;

export type CardDependencyGraphNode = BaseDependencyGraphNode<
  "card",
  CardDependencyGraphData
>;

export type SnippetDependencyGraphNode = BaseDependencyGraphNode<
  "snippet",
  SnippetDependencyGraphData
>;

export type DependencyGraphNode =
  | TableDependencyGraphNode
  | TransformDependencyGraphNode
  | CardDependencyGraphNode
  | SnippetDependencyGraphNode;

export type DependencyGraphEdge = {
  from_entity_id: DependencyId;
  from_entity_type: DependencyType;
  to_entity_id: DependencyId;
  to_entity_type: DependencyType;
};

export type DependencyGraph = {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
};

export type GetDependencyGraphRequest = {
  id: DependencyId;
  type: DependencyType;
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
