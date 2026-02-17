import type { LensParams } from "metabase-lib/transforms-inspector";

export type { CardStats } from "metabase-lib/transforms-inspector";

export type LensRef = {
  id: string;
  params?: LensParams;
};

export type RouteParams = { transformId: string; lensId?: string };
