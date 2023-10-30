import type {
  Dashboard,
  DashboardId,
  DashboardCard,
  DashCardId,
  DashCardDataMap,
  ParameterId,
  ParameterValueOrArray,
  DashboardTab,
  DashboardTabId,
} from "metabase-types/api";

export type DashboardSidebarName =
  | "addQuestion"
  | "action"
  | "clickBehavior"
  | "editParameter"
  | "sharing"
  | "info";

export type StoreDashboardTab = DashboardTab & {
  isRemoved?: boolean;
};

export type StoreDashboard = Omit<Dashboard, "dashcards" | "tabs"> & {
  dashcards: DashCardId[];
  tabs?: StoreDashboardTab[];
  // TODO: remove
  dashCardTabMovements?: Record<DashCardId, DashcardTabMovement>;
};

export type StoreDashcard = DashboardCard & {
  isDirty?: boolean;
  isRemoved?: boolean;
};

export type SelectedTabId = number | null;

export type TabDeletionId = number;

export type TabDeletion = {
  id: TabDeletionId;
  tabId: DashboardTabId;
  removedDashCardIds: DashCardId[];
};
// TODO: remove
export type DashcardTabMovement = {
  originalTabId: DashboardTabId;
  originalRow: number;
  originalCol: number;
};

export interface DashboardState {
  dashboardId: DashboardId | null;
  selectedTabId: SelectedTabId;
  dashboards: Record<DashboardId, StoreDashboard>;

  dashcards: Record<DashCardId, StoreDashcard>;
  dashcardData: DashCardDataMap;

  parameterValues: Record<ParameterId, ParameterValueOrArray>;

  loadingDashCards: {
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
  isNavigatingBackToDashboard: boolean;

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
  tabDeletions: Record<TabDeletionId, TabDeletion>;
}
