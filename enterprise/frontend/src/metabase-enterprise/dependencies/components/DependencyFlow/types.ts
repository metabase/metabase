import type { Edge, Node } from "@xyflow/react";

import type {
  CardType,
  DependencyEntityType,
  DependencyNode,
} from "metabase-types/api";

export type NodeId = Node["id"];

export type DependencyGroupType =
  | CardType
  | Exclude<DependencyEntityType, "card">;

export type DependencyGroup = {
  type: DependencyGroupType;
  nodes: DependencyNode[];
};

export type EntityNode = Node<DependencyNode, "entity">;
export type EntityGroupNode = Node<DependencyGroup, "entity-group">;
export type GraphNode = EntityNode | EntityGroupNode;

export type GraphInfo = {
  nodes: GraphNode[];
  edges: Edge[];
};
