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
  | "action"
  | "clickBehavior"
  | "editParameter"
  | "sharing"
  | "info";

export type StoreDashboard = Omit<Dashboard, "ordered_cards"> & {
  ordered_cards: DashCardId[];
};

export type StoreDashcard = DashboardOrderedCard & {
  isDirty?: boolean;
  isRemoved?: boolean;
};

export type SelectedTabId = DashboardId | null;

export interface DashboardState {
  dashboardId: DashboardId | null;
  selectedTabId: SelectedTabId;
  dashboards: Record<DashboardId, StoreDashboard>;

  dashcards: Record<DashCardId, StoreDashcard>;
  dashcardData: DashCardDataMap;

  parameterValues: Record<ParameterId, ParameterValueOrArray>;

  loadingDashCards: {
    dashcardIds: DashCardId[];
    loadingIds: DashCardId[];
    loadingStatus: "idle" | "running" | "complete";
    startTime: number | null;
    endTime: number | null;
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

  missingActionParameters: unknown;

  autoApplyFilters: {
    toastId: number | null;
    toastDashboardId: number | null;
  };
}
