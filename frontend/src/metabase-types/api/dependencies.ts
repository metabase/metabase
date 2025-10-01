import type { Card, CardId, CardType } from "./card";
import type { NativeQuerySnippet, NativeQuerySnippetId } from "./snippets";
import type { ConcreteTableId } from "./table";
import type { Transform, TransformId } from "./transform";

export type DependencyNode =
  | TableDependencyNode
  | CardDependencyNode
  | SnippetDependencyNode
  | TransformDependencyNode;
export type DependencyEntityId = DependencyNode["id"];
export type DependencyEntityType = DependencyNode["type"];

type BaseDependencyNode<TId, TType, TData> = {
  id: TId;
  type: TType;
  data: TData;
};

export type TableDependencyNode = BaseDependencyNode<
  ConcreteTableId,
  "table",
  TableDependencyData
>;

export type CardDependencyNode = BaseDependencyNode<
  CardId,
  "card",
  CardDependencyData
>;

export type SnippetDependencyNode = BaseDependencyNode<
  NativeQuerySnippetId,
  "snippet",
  SnippetDependencyData
>;

export type TransformDependencyNode = BaseDependencyNode<
  TransformId,
  "transform",
  TransformDependencyData
>;

export type TableDependencyData = {
  display_name: string;
};

export type CardDependencyData = {
  name: string;
  type: CardType;
};

export type SnippetDependencyData = {
  name: string;
};

export type TransformDependencyData = {
  name: string;
};

export type DependencyEdge = {
  from_entity_id: DependencyEntityId;
  from_entity_type: DependencyEntityType;
  to_entity_id: DependencyEntityId;
  to_entity_type: DependencyEntityType;
};

export type DependencyGraph = {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
};

export type GetDependencyGraphRequest = {
  id: DependencyEntityId;
  type: DependencyEntityType;
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
