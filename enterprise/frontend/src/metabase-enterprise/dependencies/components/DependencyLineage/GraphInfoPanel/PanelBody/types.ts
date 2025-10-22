import type { NodeLink, NodeLocation } from "../../types";

export type NodeTableInfo = {
  title: NodeLink;
  metadata: NodeLink;
  location?: NodeLocation;
};
