import type { ClickAction, ClickObject } from "metabase/visualizations/types";

export type SdkClickObject = Pick<
  ClickObject,
  "value" | "column" | "data" | "event"
>;

export interface SdkClickActionExtensionsConfig {
  mapClickActions?: (
    clickActions: ClickAction[],
    clicked: SdkClickObject,
  ) => ClickAction[];
}
