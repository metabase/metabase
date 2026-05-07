import type { NodeLink } from "metabase-enterprise/dependencies/types";

export type NodeTableInfo = {
  label: string;
  title: NodeLink;
  metadata: NodeLink;
  location: NodeLink[] | null;
};
