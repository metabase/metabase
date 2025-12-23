import type { NodeLink } from "../../../../types";

export type NodeTableInfo = {
  label: string;
  title: NodeLink;
  metadata: NodeLink;
  location: NodeLink[] | null;
};
