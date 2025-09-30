import type { Card, CardId } from "./card";
import type { NativeQuerySnippet } from "./snippets";
import type { ConcreteTableId } from "./table";
import type { Transform } from "./transform";

export type DependencyNode = TableDependencyNode | CardDependencyNode;
export type DependencyEntityId = DependencyNode["id"];
export type DependencyEntityType = DependencyNode["type"];

export type TableDependencyNode = {
  id: ConcreteTableId;
  type: "table";
  entity: TableDependencyEntity;
};

export type TableDependencyEntity = {
  id: ConcreteTableId;
  name: string;
  display_name: string;
};

export type CardDependencyNode = {
  id: CardId;
  type: "card";
  entity: CardDependencyEntity;
};

export type CardDependencyEntity = {
  id: CardId;
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
