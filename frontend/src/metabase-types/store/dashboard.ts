import type {
  Dashboard,
  DashboardId,
  DashboardOrderedCard,
  DashCardId,
  DashCardDataMap,
  ParameterId,
  DashboardTabId,
} from "metabase-types/api";
import { ParameterValueOrArray } from "metabase-types/types/Parameter";

export type DashboardSidebarName =
  | "addQuestion"
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

export interface DashboardState {
  dashboardId: DashboardId | null;
  selectedTabId: DashboardTabId | null;
  dashboards: Record<DashboardId, StoreDashboard>;

  dashcards: Record<DashCardId, StoreDashcard>;
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

  slowCards: Record<DashCardId, unknown>;

  sidebar: {
    name?: DashboardSidebarName;
    props: Record<string, unknown>;
  };
}
