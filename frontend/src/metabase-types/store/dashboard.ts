import type {
  Dashboard,
  DashboardId,
  DashboardOrderedCard,
  DashCardId,
  DashCardDataMap,
  ParameterId,
  ParameterValueOrArray,
  DashboardOrderedTab,
  DashboardTabId,
} from "metabase-types/api";

export type DashboardSidebarName =
  | "addQuestion"
  | "action"
  | "clickBehavior"
  | "editParameter"
  | "sharing"
  | "info";

export type StoreDashboardTab = DashboardOrderedTab & {
  isRemoved?: boolean;
};

export type StoreDashboard = Omit<
  Dashboard,
  "ordered_cards" | "ordered_tabs"
> & {
  ordered_cards: DashCardId[];
  ordered_tabs?: StoreDashboardTab[];
};

export type StoreDashcard = DashboardOrderedCard & {
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
