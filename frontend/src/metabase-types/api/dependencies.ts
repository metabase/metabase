import type { Card, CardType } from "./card";
import type { NativeQuerySnippet } from "./snippets";
import type { Transform } from "./transform";

export type DependencyId = number;

type BaseDependencyNode<TType, TData> = {
  id: DependencyId;
  type: TType;
  data: TData;
};

export type TableDependencyData = {
  name: string;
  display_name: string;
};

export type TransformDependencyData = {
  name: string;
};

export type CardDependencyData = {
  name: string;
  type: CardType;
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

export type DependencyEntry = {
  id: DependencyId;
  type: DependencyType;
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
