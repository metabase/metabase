import type { Card, CardDashboardInfo, CardId, CardType } from "./card";
import type { Collection, CollectionId } from "./collection";
import type { DashboardId } from "./dashboard";
import type { DatabaseId } from "./database";
import type { NativeQuerySnippet, NativeQuerySnippetId } from "./snippets";
import type { Transform, TransformId } from "./transform";
import type { CardDisplayType } from "./visualization";

export type DependencyId = number;

type BaseDependencyNode<TType, TData> = {
  id: DatabaseId;
  type: TType;
  data: TData;
  usage_stats?: DependencyUsageStats;
};

export type TableDependencyData = {
  name: string;
};

export type TransformDependencyData = {
  name: string;
};

export type CardDependencyData = {
  type: CardType;
  name: string;
};

export type SnippetDependencyData = {
  name: string;
};

export type TableDependencyNode = BaseDependencyNode<
  "table",
  TableDependencyData
>;

export type TransformDependencyNode = BaseDependencyNode<
  "transform",
  TransformDependencyData
>;

export type CardDependencyNode = BaseDependencyNode<"card", CardDependencyData>;

export type SnippetDependencyNode = BaseDependencyNode<
  "snippet",
  SnippetDependencyData
>;

export type DependencyNode =
  | TableDependencyNode
  | TransformDependencyNode
  | CardDependencyNode
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

type BaseDependencyInfo<TType, TData> = {
  id: DependencyId;
  type: TType;
  data: TData;
  usages?: DependencyUsages;
};

export type TableDependencyMetadata = {
  name: string;
  display_name: string;
  description: string | null;
  db_id: DependencyId;
  schema: string | null;
};

export type TransformDependencyMetadata = {
  id: TransformId;
  name: string;
  description: string | null;
};

export type CardDependencyMetadata = {
  id: CardId;
  name: string;
  description: string | null;
  type: CardType;
  display: CardDisplayType;
  collection_id: CollectionId | null;
  dashboard_id: DashboardId | null;

  collection: Collection | null;
  dashboard: CardDashboardInfo | null;
};

export type SnippetDependencyMetadata = {
  id: NativeQuerySnippetId;
  name: string;
  description: string | null;
};

export type DependencyUsages = {
  questions?: CardDependencyMetadata[];
  models?: CardDependencyMetadata[];
  metrics?: CardDependencyMetadata[];
  transforms?: TransformDependencyMetadata[];
  snippets?: SnippetDependencyMetadata[];
};

export type TableDependencyInfo = BaseDependencyInfo<
  "table",
  TableDependencyMetadata
>;

export type TransformDependencyInfo = BaseDependencyInfo<
  "transform",
  TransformDependencyMetadata
>;

export type CardDependencyInfo = BaseDependencyInfo<
  "card",
  CardDependencyMetadata
>;

export type SnippetDependencyInfo = BaseDependencyInfo<
  "snippet",
  SnippetDependencyMetadata
>;

export type DependencyInfo =
  | TableDependencyInfo
  | TransformDependencyInfo
  | CardDependencyInfo
  | SnippetDependencyInfo;

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
