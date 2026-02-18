import type { LensParams } from "metabase-types/api";

export type { CardStats } from "metabase-lib/transforms-inspector";

export type LensHandle = {
  id: string;
  params?: LensParams;
};

export type RouteParams = { transformId: string; lensId?: string };
