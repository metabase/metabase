import type {
  Dashboard,
  DashboardId,
  DashboardOrderedCard,
  DashCardId,
  DashCardDataMap,
  ParameterId,
  ParameterValueOrArray,
} from "metabase-types/api";

export type DashboardSidebarName =
  | "addQuestion"
  | "clickBehavior"
  | "editParameter"
  | "sharing"
  | "info";

export interface DashboardState {
  dashboardId: DashboardId | null;
  dashboards: Record<DashboardId, Dashboard>;

  dashcards: Record<DashCardId, DashboardOrderedCard>;
  dashcardData: DashCardDataMap;

  parameterValues: Record<ParameterId, ParameterValueOrArray>;

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
  isAddTextPopoverOpen: boolean;

  slowCards: Record<DashCardId, unknown>;

  sidebar: {
    name?: DashboardSidebarName;
    props: Record<string, unknown>;
  };
}
