import type { InspectorLensId } from "metabase-types/api";
export type { LensHandle } from "metabase-types/api";

export type { CardStats } from "metabase/transforms/lib/transforms-inspector";

export type RouteParams = { transformId: string; lensId?: InspectorLensId };

// Lens ID concatenated with params
export type LensKey = string;
