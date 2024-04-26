import type { ClickAction, ClickObject } from "metabase/visualizations/types";

export type SdkDataPointObject = Pick<
  ClickObject,
  "value" | "column" | "data" | "event"
>;

export type SdkClickActionPluginsConfig = Pick<
  SdkPluginsConfig,
  "mapQuestionClickActions"
>;

export interface SdkPluginsConfig {
  mapQuestionClickActions?: (
    clickActions: ClickAction[],
    clickedDataPoint: SdkDataPointObject,
  ) => ClickAction[];
}
