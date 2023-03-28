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

export interface DashboardState {
  dashboardId: DashboardId | null;
  selectedTabId: DashboardTabId | null;
  dashboards: Record<
    DashboardId,
    Omit<Dashboard, "ordered_cards"> & { ordered_cards: DashCardId[] }
  >;

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

  slowCards: Record<DashCardId, unknown>;

  sidebar: {
    name?: DashboardSidebarName;
    props: Record<string, unknown>;
  };
}
