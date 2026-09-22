import type { ClickBehaviorExtraData } from "metabase/dashboard/utils/click-behavior";
import type { ValueAndColumnForColumnNameDate } from "metabase/value-formatting";
import type { ClickObject } from "metabase/visualizations/types";
import type { ComputedVisualizationSettings } from "metabase/viz-core";
import type {
  Card,
  CardId,
  ClickBehavior,
  ClickBehaviorParameterMapping,
  ClickBehaviorType,
  DashboardId,
  DashboardTabId,
  ParameterId,
  ParameterValueOrArray,
} from "metabase-types/api";

export type DashboardDrillType =
  | "link-url"
  | "question-url"
  | "dashboard-url"
  | "dashboard-filter"
  | "dashboard-reset";

export interface DrillExtraData extends ClickBehaviorExtraData {
  questions?: Record<CardId, Card>;
}

// ClickObject with the shapes dashboards put in its untyped settings/extraData.
export interface ClickBehaviorClickObject extends Omit<
  ClickObject,
  "settings" | "extraData"
> {
  settings?: ComputedVisualizationSettings;
  extraData?: DrillExtraData;
}

type ClickBehaviorPropertiesBase = {
  type: ClickBehaviorType;
  parameterMapping?: ClickBehaviorParameterMapping;
};

// ClickBehavior flattened for uniform destructuring, discriminated on linkType
// so targetId narrows to the matching id type.
export type ClickBehaviorProperties = ClickBehaviorPropertiesBase &
  (
    | {
        linkType?: never;
        linkTemplate?: never;
        tabId?: never;
        targetId?: never;
      }
    | {
        linkType: "url";
        linkTemplate?: string;
        tabId?: never;
        targetId?: never;
      }
    | {
        linkType: "question";
        linkTemplate?: never;
        tabId?: never;
        targetId?: CardId;
      }
    | {
        linkType: "dashboard";
        linkTemplate?: never;
        tabId?: DashboardTabId;
        targetId?: DashboardId;
      }
  );

export type ClickBehaviorDataOptions = {
  data: ValueAndColumnForColumnNameDate;
  extraData: ClickBehaviorExtraData | undefined;
  clickBehavior: ClickBehavior;
};

export type ParameterIdValuePair = [ParameterId, ParameterValueOrArray | null];
