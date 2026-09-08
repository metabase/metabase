import type * as Lib from "metabase-lib";
import type { LegacyDrill } from "metabase/visualizations/types";

export type QueryClickActionsMode = {
  name: string;
  clickActions: LegacyDrill[];
  fallback?: LegacyDrill;
} & (
  | {
      hasDrills: false;
    }
  | {
      hasDrills: true;
      availableOnlyDrills?: Lib.DrillThruType[];
    }
);
