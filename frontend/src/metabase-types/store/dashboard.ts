import type {
  Dashboard,
  DashboardId,
  DashboardOrderedCard,
  DashCardId,
  DashCardDataMap,
  ParameterId,
} from "metabase-types/api";
import { ParameterValueOrArray } from "metabase-types/types/Parameter";

export type DashboardSidebarName =
  | "addQuestion"
  | "addActionButton"
  | "addActionForm"
  | "clickBehavior"
  | "editParameter"
  | "sharing"
  | "info";

type ParameterValueCacheKey = string;

export interface DashboardState {
  dashboardId: DashboardId | null;
  dashboards: Record<DashboardId, Dashboard>;

  dashcards: Record<DashCardId, DashboardOrderedCard>;
  dashcardData: DashCardDataMap;

  parameterValues: Record<ParameterId, ParameterValueOrArray>;
  parameterValuesSearchCache: Record<
    ParameterValueCacheKey,
    {
      has_more_values: boolean;
      results: ParameterValueOrArray[];
    }
  >;

  loadingDashCards: {
    dashcardIds: DashCardId[];
    loadingIds: DashCardId[];
    loadingStatus: "idle" | "running" | "complete";
    startTime: number | null;
  };
  loadingControls: {
    documentTitle?: string;
    showLoadCompleteFavicon?: boolean;
  };

  isEditing: Dashboard | null;
  isAddParameterPopoverOpen: boolean;

  slowCards: Record<DashCardId, unknown>;

  sidebar: {
    name?: DashboardSidebarName;
    props: Record<string, unknown>;
  };

  titleTemplateChange: string | null;
}
