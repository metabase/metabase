import type { InspectorLensId, LensParams } from "metabase-types/api";

export type { CardStats } from "metabase-lib/transforms-inspector";

export type LensHandle = {
  id: InspectorLensId;
  params?: LensParams;
};

export type RouteParams = { transformId: string; lensId?: InspectorLensId };
