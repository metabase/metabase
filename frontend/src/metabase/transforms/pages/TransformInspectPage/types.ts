export type { CardStats } from "metabase-lib/transforms-inspector";

export type LensRef = {
  id: string;
  title: string;
  params?: Record<string, unknown>;
};

export type LensStackEntry = {
  lensRef: LensRef;
  siblings: LensRef[];
  drillSiblings: LensRef[];
};
