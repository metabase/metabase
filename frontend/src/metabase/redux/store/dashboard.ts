import type {
  Card,
  CardId,
  DashCardDataMap,
  DashCardId,
  Dashboard,
  DashboardCard,
  DashboardId,
  DashboardTab,
  DashboardTabId,
  ParameterId,
  ParameterValueOrArray,
  ParameterValuesMap,
  TimelineEventId,
  TimelineEventsVisibility,
} from "metabase-types/api";

export type DashboardSidebarName =
  | "addQuestion"
  | "action"
  | "clickBehavior"
  | "editParameter"
  | "settings"
  | "sharing"
  | "info"
  | "events";

interface BaseSidebarState {
  name?: DashboardSidebarName;
  props: Record<string, unknown> & {
    dashcardId?: DashCardId;
  };
}

type ClickBehaviorSidebarProps = {
  dashcardId: DashCardId;
};

export interface ClickBehaviorSidebarState extends BaseSidebarState {
  name: "clickBehavior";
  props: ClickBehaviorSidebarProps;
}

type EditParameterSidebarProps = {
  dashcardId?: DashCardId;
  parameterId: ParameterId;
};

export interface EditParameterSidebarState extends BaseSidebarState {
  name: "editParameter";
  props: EditParameterSidebarProps;
}

export type EventsSidebarProps = {
  dashcardId?: DashCardId;
  focusedEventIds?: TimelineEventId[];
};

export interface EventsSidebarState extends BaseSidebarState {
  name: "events";
  props: EventsSidebarProps;
}

export type DashboardSidebarState =
  | BaseSidebarState
  | ClickBehaviorSidebarState
  | EditParameterSidebarState
  | EventsSidebarState;

export type TimelineEventsSelection = {
  dashcardId?: DashCardId;
  eventIds: TimelineEventId[];
};

export interface DashboardTimelineEventsState {
  overrides: Record<DashCardId, TimelineEventsVisibility>;
  selection: TimelineEventsSelection | null;
  hasTrackedEventsShown: boolean;
}

export type StoreDashboardTab = DashboardTab & {
  isRemoved?: boolean;
};

export type StoreDashboard = Omit<Dashboard, "dashcards" | "tabs"> & {
  dashcards: DashCardId[];
  tabs?: StoreDashboardTab[];
  isDirty?: boolean;
};

export type StoreDashcard = DashboardCard & {
  isAdded?: boolean;
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

export type DashboardLinkTargets = {
  questions: Record<CardId, Card>;
  dashboards: Record<DashboardId, Dashboard>;
};

export type DashboardLoadingStatus = "idle" | "running" | "complete";

export type DashboardCardsLoadingState = {
  loadingIds: DashCardId[];
  loadingStatus: DashboardLoadingStatus;
  startTime: number | null;
  endTime: number | null;
};

export type DashboardLoadingControls = {
  isLoading: boolean;
  documentTitle?: string;
  showLoadCompleteFavicon?: boolean;
};

export interface DashboardState {
  dashboardId: DashboardId | null;
  selectedTabId: SelectedTabId;
  dashboards: Record<DashboardId, StoreDashboard>;

  dashcards: Record<DashCardId, StoreDashcard>;
  dashcardData: DashCardDataMap;

  linkTargets: DashboardLinkTargets;

  parameterValues: Record<
    ParameterId,
    ParameterValueOrArray | undefined | null
  >;
  draftParameterValues: ParameterValuesMap;

  loadingDashCards: DashboardCardsLoadingState;
  loadingControls: DashboardLoadingControls;

  editingDashboard: Dashboard | null;
  isAddParameterPopoverOpen: boolean;
  isNavigatingBackToDashboard: boolean;

  slowCards: Record<DashCardId, boolean>;

  sidebar: DashboardSidebarState;

  timelineEvents: DashboardTimelineEventsState;

  missingActionParameters: unknown;

  autoApplyFilters: {
    toastId: number | null;
    toastDashboardId: number | null;
  };
  tabDeletions: Record<TabDeletionId, TabDeletion>;
}
