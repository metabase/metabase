import type { Lens } from "metabase/transforms/pages/TransformInspectPage/types";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";

export const isDrillLens = (lens: Lens): lens is TriggeredDrillLens =>
  "lens_id" in lens;
