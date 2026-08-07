import type { ClickBehaviorExtraData } from "metabase/dashboard/utils/click-behavior";
import type { ValueAndColumnForColumnNameDate } from "metabase/visualizations/lib/formatting/link";
import type {
  ClickObject,
  ComputedVisualizationSettings,
} from "metabase/visualizations/types";
import type {
  Card,
  CardId,
  ClickBehavior,
  ClickBehaviorParameterMapping,
  ClickBehaviorType,
  CustomDestinationClickBehaviorLinkType,
  DashboardId,
  DashboardTabId,
} from "metabase-types/api";

export type DashboardDrillType =
  | "link-url"
  | "question-url"
  | "dashboard-url"
  | "dashboard-filter"
  | "dashboard-reset";

export interface DrillExtraData extends ClickBehaviorExtraData {
  questions?: Record<CardId | string, Card>;
}

// ClickObject with the shapes dashboards put in its untyped settings/extraData.
export interface ClickBehaviorClickObject extends Omit<
  ClickObject,
  "settings" | "extraData"
> {
  settings?: ComputedVisualizationSettings;
  extraData?: DrillExtraData;
}

export type ClickBehaviorProperties = {
  type: ClickBehaviorType;
  linkType?: CustomDestinationClickBehaviorLinkType;
  linkTemplate?: string;
  parameterMapping?: ClickBehaviorParameterMapping;
  tabId?: DashboardTabId;
  targetId?: CardId | DashboardId;
};

export type ClickBehaviorDataOptions = {
  data: ValueAndColumnForColumnNameDate;
  extraData: ClickBehaviorExtraData | undefined;
  clickBehavior: ClickBehavior;
};
