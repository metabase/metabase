import type { Card, CardType } from "./card";
import type { NativeQuerySnippet } from "./snippets";
import type { Transform } from "./transform";

export type DependencyId = number;
export type DependencyType = "card" | "table" | "transform" | "snippet";

export type DependencyNode = {
  id: DependencyId;
  type: DependencyType;
  name: string;
  card_type?: CardType;
  usage_stats?: DependencyUsageStats;
};

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
