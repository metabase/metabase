import type { NodeLink } from "../../types";

export type NodeTableInfo = {
  title: NodeLink;
  metadata: NodeLink;
  location: NodeLink[] | null;
};
