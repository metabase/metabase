import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";
import type { InspectorLensMetadata } from "metabase-types/api";

import type { LensRef } from "./types";

export const convertLensToRef = (lens: InspectorLensMetadata): LensRef => ({
  id: lens.id,
  title: lens.display_name,
});

export const convertDrillLensToRef = (
  drillLens: TriggeredDrillLens,
  metadataMap: Map<string, InspectorLensMetadata>,
): LensRef => ({
  id: drillLens.lens_id,
  params: drillLens.params,
  title:
    drillLens.reason ??
    metadataMap.get(drillLens.lens_id)?.display_name ??
    drillLens.lens_id,
});
