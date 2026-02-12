import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";
import type { InspectorLensMetadata } from "metabase-types/api";

export type { CardStats } from "metabase-lib/transforms-inspector";
export type Lens = InspectorLensMetadata | TriggeredDrillLens;
export type LensQueryParams = {
  lensId: string;
  lensParams: unknown | undefined;
};
