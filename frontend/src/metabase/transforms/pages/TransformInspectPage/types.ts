import type { InspectorLensId } from "metabase-types/api";
export type { LensHandle } from "metabase/api/tags/utils";

export type { CardStats } from "metabase-lib/transforms-inspector";

export type RouteParams = { transformId: string; lensId?: InspectorLensId };
