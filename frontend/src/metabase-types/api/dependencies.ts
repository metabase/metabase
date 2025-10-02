import type { Card, CardType } from "./card";
import type { DatabaseId } from "./database";
import type { NativeQuerySnippet } from "./snippets";
import type { Transform } from "./transform";

export type DependencyId = number;

type BaseDependencyNode<TType, TData> = {
  id: DatabaseId;
  type: TType;
  data: TData;
  usage_stats?: DependencyUsageStats;
};

export type CardDependencyData = {
  type: CardType;
  name: string;
};

export type TableDependencyData = {
  name: string;
  display_name: string;
  db_id: DatabaseId;
  schema: string | null;
};

export type TransformDependencyData = {
  name: string;
};

export type SnippetDependencyData = {
  name: string;
};

export type CardDependencyNode = BaseDependencyNode<"card", CardDependencyData>;

export type TableDependencyNode = BaseDependencyNode<
  "table",
  TableDependencyData
>;

export type TransformDependencyNode = BaseDependencyNode<
  "transform",
  TransformDependencyData
>;

export type SnippetDependencyNode = BaseDependencyNode<
  "snippet",
  SnippetDependencyData
>;

export type DependencyNode =
  | CardDependencyNode
  | TableDependencyNode
  | TransformDependencyNode
  | SnippetDependencyNode;

export type DependencyType = DependencyNode["type"];

export type DependencyUsageStats = {
  questions?: number;
  models?: number;
  metrics?: number;
  transforms?: number;
  snippets?: number;
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
