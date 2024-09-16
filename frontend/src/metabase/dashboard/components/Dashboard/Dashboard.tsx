import type { Location, Query } from "history";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { usePrevious, useUnmount } from "react-use";
import _ from "underscore";

import { deletePermanently } from "metabase/archive/actions";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import {
  moveDashboardToCollection,
  type navigateToNewCardFromDashboard,
  type NewDashCardOpts,
  setArchivedDashboard,
  type SetDashboardAttributesOpts,
} from "metabase/dashboard/actions";
import { DashboardHeader } from "metabase/dashboard/components/DashboardHeader";
import type {
  DashboardDisplayOptionControls,
  FetchDashboardResult,
  SuccessfulFetchDashboardResult,
} from "metabase/dashboard/types";
import Bookmarks from "metabase/entities/bookmarks";
import Dashboards from "metabase/entities/dashboards";
import { getMainElement } from "metabase/lib/dom";
import { useDispatch } from "metabase/lib/redux";
import type {
  CardId,
  Dashboard as IDashboard,
  DashboardCard,
  DashboardId,
  DashboardTabId,
  DashCardId,
  ParameterId,
  ParameterValueOrArray,
  RowValue,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
  VisualizationSettings,
} from "metabase-types/api";
import type {
  DashboardSidebarName,
  SelectedTabId,
  State,
  StoreDashcard,
} from "metabase-types/store";

import { DASHBOARD_PDF_EXPORT_ROOT_ID, SIDEBAR_NAME } from "../../constants";
import { DashboardGridConnected } from "../DashboardGrid";
import { DashboardParameterPanel } from "../DashboardParameterPanel";
import { DashboardSidebars } from "../DashboardSidebars";

import {
  CardsContainer,
  DashboardBody,
  DashboardHeaderContainer,
  DashboardLoadingAndErrorWrapper,
  DashboardStyled,
  ParametersAndCardsContainer,
} from "./Dashboard.styled";
import {
  DashboardEmptyState,
  DashboardEmptyStateWithoutAddPrompt,
} from "./DashboardEmptyState/DashboardEmptyState";

export type DashboardProps = {
  route: Route;
  params: {
    slug: string;
  };
  children?: ReactNode;
  canManageSubscriptions: boolean;
  isAdmin: boolean;
  isNavbarOpen: boolean;
  isEditing: boolean;
  isSharing: boolean;
  dashboardBeforeEditing: IDashboard | null;
  isEditingParameter: boolean;
  isDirty: boolean;
  dashboard: IDashboard | null;
  slowCards: Record<DashCardId, boolean>;
  parameterValues: Record<ParameterId, ParameterValueOrArray>;
  loadingStartTime: number | null;
  clickBehaviorSidebarDashcard: StoreDashcard | null;
  isAddParameterPopoverOpen: boolean;
  sidebar: State["dashboard"]["sidebar"];
  isHeaderVisible: boolean;
  isAdditionalInfoVisible: boolean;
  selectedTabId: SelectedTabId;
  isNavigatingBackToDashboard: boolean;
  addCardOnLoad?: DashCardId;
  editingOnLoad?: string | string[] | boolean;
  location: Location;
  dashboardId: DashboardId;
  parameterQueryParams: Query;

  initialize: (opts?: { clearCache?: boolean }) => void;
  cancelFetchDashboardCardData: () => void;
  addCardToDashboard: (opts: {
    dashId: DashboardId;
    cardId: CardId;
    tabId: DashboardTabId | null;
  }) => void;
  addHeadingDashCardToDashboard: (opts: NewDashCardOpts) => void;
  addMarkdownDashCardToDashboard: (opts: NewDashCardOpts) => void;
  addLinkDashCardToDashboard: (opts: NewDashCardOpts) => void;

  setEditingDashboard: (dashboard: IDashboard | null) => void;
  setDashboardAttributes: (opts: SetDashboardAttributesOpts) => void;
  setSharing: (isSharing: boolean) => void;
  toggleSidebar: (sidebarName: DashboardSidebarName) => void;
  closeSidebar: () => void;

  closeNavbar: () => void;
  setErrorPage: (error: unknown) => void;
  onChangeLocation: (location: Location) => void;

  setParameterName: (id: ParameterId, name: string) => void;
  setParameterType: (id: ParameterId, type: string) => void;
  navigateToNewCardFromDashboard: typeof navigateToNewCardFromDashboard;
  setParameterDefaultValue: (id: ParameterId, value: RowValue) => void;
  setParameterRequired: (id: ParameterId, value: boolean) => void;
  setParameterTemporalUnits: (id: ParameterId, value: boolean) => void;
  setParameterIsMultiSelect: (id: ParameterId, isMultiSelect: boolean) => void;
  setParameterQueryType: (id: ParameterId, queryType: ValuesQueryType) => void;
  setParameterSourceType: (
    id: ParameterId,
    sourceType: ValuesSourceType,
  ) => void;
  setParameterSourceConfig: (
    id: ParameterId,
    config: ValuesSourceConfig,
  ) => void;
  setParameterFilteringParameters: (parameters: ParameterId[]) => void;
  showAddParameterPopover: () => void;
  removeParameter: (id: ParameterId) => void;

  onReplaceAllDashCardVisualizationSettings: (
    id: DashCardId,
    settings: Partial<VisualizationSettings>,
  ) => void;
  onUpdateDashCardVisualizationSettings: (
    id: DashCardId,
    settings: Partial<VisualizationSettings>,
  ) => void;
  onUpdateDashCardColumnSettings: (
    id: DashCardId,
    columnKey: string,
    settings?: Record<string, unknown> | null,
  ) => void;
  updateDashboardAndCards: () => void;

  setSidebar: (opts: { name: DashboardSidebarName }) => void;
  hideAddParameterPopover: () => void;

  fetchDashboard: (opts: {
    dashId: DashboardId;
    queryParams?: Query;
    options?: {
      clearCache?: boolean;
      preserveParameters?: boolean;
    };
  }) => Promise<FetchDashboardResult>;

  fetchDashboardCardData: (opts?: {
    isRefreshing?: boolean;
    reload?: boolean;
    clearCache?: boolean;
  }) => void;
} & DashboardDisplayOptionControls;

function Dashboard(props: DashboardProps) {
  const {
    addCardOnLoad,
    addCardToDashboard,
    cancelFetchDashboardCardData,
    closeNavbar,
    dashboard,
    dashboardId,
    editingOnLoad,
    fetchDashboard,
    fetchDashboardCardData,
    initialize,
    isEditing,
    isFullscreen,
    isNavigatingBackToDashboard,
    isNightMode = false,
    isSharing,
    onRefreshPeriodChange,
    parameterValues,
    selectedTabId,
    setEditingDashboard,
    setErrorPage,
    setSharing,
    toggleSidebar,
    parameterQueryParams,
    location,
  } = props;
  const dispatch = useDispatch();

  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hasScroll, setHasScroll] = useState(getMainElement()?.scrollTop > 0);

  const previousDashboard = usePrevious(dashboard);
  const previousDashboardId = usePrevious(dashboardId);
  const previousTabId = usePrevious(selectedTabId);
  const previousParameterValues = usePrevious(parameterValues);

  const currentTabDashcards = useMemo(() => {
    if (!dashboard || !Array.isArray(dashboard.dashcards)) {
      return [];
    }
    if (!selectedTabId) {
      return dashboard.dashcards;
    }
    return dashboard.dashcards.filter(
      (dc: DashboardCard) => dc.dashboard_tab_id === selectedTabId,
    );
  }, [dashboard, selectedTabId]);

  const canWrite = Boolean(dashboard?.can_write);
  const canRestore = Boolean(dashboard?.can_restore);
  const canDelete = Boolean(dashboard?.can_delete);
  const tabHasCards = currentTabDashcards.length > 0;
  const dashboardHasCards = dashboard && dashboard.dashcards.length > 0;

  const shouldRenderAsNightMode = isNightMode && isFullscreen;

  const handleSetEditing = useCallback(
    (dashboard: IDashboard | null) => {
      onRefreshPeriodChange(null);
      setEditingDashboard(dashboard);
    },
    [onRefreshPeriodChange, setEditingDashboard],
  );

  const handleAddQuestion = useCallback(() => {
    onRefreshPeriodChange(null);
    setEditingDashboard(dashboard);
    toggleSidebar(SIDEBAR_NAME.addQuestion);
  }, [onRefreshPeriodChange, setEditingDashboard, dashboard, toggleSidebar]);

  const handleLoadDashboard = useCallback(
    async (dashboardId: DashboardId) => {
      initialize({ clearCache: !isNavigatingBackToDashboard });

      const result = await fetchDashboard({
        dashId: dashboardId,
        queryParams: parameterQueryParams,
        options: {
          clearCache: !isNavigatingBackToDashboard,
          preserveParameters: isNavigatingBackToDashboard,
        },
      });

      if (!isSuccessfulFetchDashboardResult(result)) {
        setErrorPage(result.payload);
        return;
      }

      try {
        const dashboard = result.payload.dashboard;
        if (editingOnLoad) {
          onRefreshPeriodChange(null);
          setEditingDashboard(dashboard);
        }
        if (addCardOnLoad != null) {
          addCardToDashboard({
            dashId: dashboardId,
            cardId: addCardOnLoad,
            tabId: dashboard.tabs?.[0]?.id ?? null,
          });
        }
      } catch (error) {
        if (error instanceof Response && error.status === 404) {
          setErrorPage({ ...error, context: "dashboard" });
        } else {
          console.error(error);
          setError(error);
        }
      }
    },
    [
      addCardOnLoad,
      addCardToDashboard,
      editingOnLoad,
      fetchDashboard,
      initialize,
      isNavigatingBackToDashboard,
      onRefreshPeriodChange,
      parameterQueryParams,
      setEditingDashboard,
      setErrorPage,
    ],
  );

  useEffect(() => {
    const hasDashboardChanged = dashboardId !== previousDashboardId;
    if (hasDashboardChanged) {
      handleLoadDashboard(dashboardId).then(() => setIsInitialized(true));
      return;
    }

    if (!dashboard) {
      return;
    }

    const hasDashboardLoaded = !previousDashboard;
    const hasTabChanged = selectedTabId !== previousTabId;
    const hasParameterValueChanged = !_.isEqual(
      parameterValues,
      previousParameterValues,
    );

    if (hasDashboardLoaded) {
      fetchDashboardCardData({ reload: false, clearCache: true });
    } else if (hasTabChanged || hasParameterValueChanged) {
      fetchDashboardCardData();
    }
  }, [
    dashboard,
    dashboardId,
    fetchDashboardCardData,
    handleLoadDashboard,
    isInitialized,
    parameterValues,
    previousDashboard,
    previousDashboardId,
    previousParameterValues,
    previousTabId,
    selectedTabId,
  ]);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const node = getMainElement();

    const handleScroll = (event: any) => {
      setHasScroll(event.target.scrollTop > 0);
    };

    node.addEventListener("scroll", handleScroll, { passive: true });

    return () => node.removeEventListener("scroll", handleScroll);
  }, [isInitialized]);

  useUnmount(() => {
    cancelFetchDashboardCardData();
  });

  const renderContent = () => {
    if (!dashboard) {
      return null;
    }

    if (!dashboardHasCards && !canWrite) {
      return (
        <DashboardEmptyStateWithoutAddPrompt
          isNightMode={shouldRenderAsNightMode}
        />
      );
    }
    if (!dashboardHasCards) {
      return (
        <DashboardEmptyState
          dashboard={dashboard}
          isNightMode={shouldRenderAsNightMode}
          addQuestion={handleAddQuestion}
          closeNavbar={closeNavbar}
        />
      );
    }
    if (dashboardHasCards && !tabHasCards) {
      return (
        <DashboardEmptyStateWithoutAddPrompt
          isNightMode={shouldRenderAsNightMode}
        />
      );
    }
    return (
      <DashboardGridConnected
        clickBehaviorSidebarDashcard={props.clickBehaviorSidebarDashcard}
        isNightMode={shouldRenderAsNightMode}
        isFullscreen={props.isFullscreen}
        isEditingParameter={props.isEditingParameter}
        isEditing={props.isEditing}
        dashboard={dashboard}
        slowCards={props.slowCards}
        navigateToNewCardFromDashboard={props.navigateToNewCardFromDashboard}
        selectedTabId={selectedTabId}
        onEditingChange={handleSetEditing}
      />
    );
  };

  return (
    <DashboardLoadingAndErrorWrapper
      isFullHeight={isEditing || isSharing}
      isFullscreen={isFullscreen}
      isNightMode={shouldRenderAsNightMode}
      loading={!dashboard}
      error={error}
    >
      {() => {
        if (!dashboard) {
          return null;
        }

        return (
          <DashboardStyled>
            {dashboard.archived && (
              <ArchivedEntityBanner
                name={dashboard.name}
                entityType="dashboard"
                canWrite={canWrite}
                canRestore={canRestore}
                canDelete={canDelete}
                onUnarchive={async () => {
                  await dispatch(setArchivedDashboard(false));
                  await dispatch(Bookmarks.actions.invalidateLists());
                }}
                onMove={({ id }) => dispatch(moveDashboardToCollection({ id }))}
                onDeletePermanently={() => {
                  const { id } = dashboard;
                  const deleteAction = Dashboards.actions.delete({ id });
                  dispatch(deletePermanently(deleteAction));
                }}
              />
            )}

            <DashboardHeaderContainer
              data-element-id="dashboard-header-container"
              id="Dashboard-Header-Container"
              isFullscreen={isFullscreen}
              isNightMode={shouldRenderAsNightMode}
            >
              {/**
               * Do not conditionally render `<DashboardHeader />` as it calls
               * `useDashboardTabs` under the hood. This hook sets `selectedTabId`
               * in Redux state which kicks off a fetch for the dashboard cards.
               */}
              <DashboardHeader
                location={location}
                dashboard={dashboard}
                isNightMode={shouldRenderAsNightMode}
                isFullscreen={isFullscreen}
                onRefreshPeriodChange={onRefreshPeriodChange}
                dashboardBeforeEditing={props.dashboardBeforeEditing}
                onFullscreenChange={props.onFullscreenChange}
                isAdditionalInfoVisible={props.isAdditionalInfoVisible}
                hasNightModeToggle={props.hasNightModeToggle}
                onNightModeChange={props.onNightModeChange}
                refreshPeriod={props.refreshPeriod}
                setRefreshElapsedHook={props.setRefreshElapsedHook}
              />
            </DashboardHeaderContainer>

            <DashboardBody isEditingOrSharing={isEditing || isSharing}>
              <ParametersAndCardsContainer
                id={DASHBOARD_PDF_EXPORT_ROOT_ID}
                data-element-id="dashboard-parameters-and-cards"
                data-testid="dashboard-parameters-and-cards"
                shouldMakeDashboardHeaderStickyAfterScrolling={
                  !isFullscreen && (isEditing || isSharing)
                }
              >
                <DashboardParameterPanel
                  isFullscreen={isFullscreen}
                  hasScroll={hasScroll}
                />
                <CardsContainer data-element-id="dashboard-cards-container">
                  {renderContent()}
                </CardsContainer>
              </ParametersAndCardsContainer>

              <DashboardSidebars
                dashboard={dashboard}
                showAddParameterPopover={props.showAddParameterPopover}
                removeParameter={props.removeParameter}
                addCardToDashboard={props.addCardToDashboard}
                clickBehaviorSidebarDashcard={
                  props.clickBehaviorSidebarDashcard
                }
                onReplaceAllDashCardVisualizationSettings={
                  props.onReplaceAllDashCardVisualizationSettings
                }
                onUpdateDashCardVisualizationSettings={
                  props.onUpdateDashCardVisualizationSettings
                }
                onUpdateDashCardColumnSettings={
                  props.onUpdateDashCardColumnSettings
                }
                setParameterName={props.setParameterName}
                setParameterType={props.setParameterType}
                setParameterDefaultValue={props.setParameterDefaultValue}
                setParameterIsMultiSelect={props.setParameterIsMultiSelect}
                setParameterQueryType={props.setParameterQueryType}
                setParameterSourceType={props.setParameterSourceType}
                setParameterSourceConfig={props.setParameterSourceConfig}
                setParameterFilteringParameters={
                  props.setParameterFilteringParameters
                }
                setParameterRequired={props.setParameterRequired}
                setParameterTemporalUnits={props.setParameterTemporalUnits}
                isFullscreen={props.isFullscreen}
                params={props.params}
                sidebar={props.sidebar}
                closeSidebar={props.closeSidebar}
                selectedTabId={props.selectedTabId}
                onCancel={() => setSharing(false)}
              />
            </DashboardBody>
          </DashboardStyled>
        );
      }}
    </DashboardLoadingAndErrorWrapper>
  );
}

function isSuccessfulFetchDashboardResult(
  result: FetchDashboardResult,
): result is SuccessfulFetchDashboardResult {
  const hasError = "error" in result;
  return !hasError;
}

export { Dashboard };
