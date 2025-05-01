import cx from "classnames";
import type { Query } from "history";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrevious, useUnmount } from "react-use";
import _ from "underscore";

import { useListDatabasesQuery } from "metabase/api";
import { deletePermanently } from "metabase/archive/actions";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import {
  type NewDashCardOpts,
  type SetDashboardAttributesOpts,
  moveDashboardToCollection,
  setArchivedDashboard,
} from "metabase/dashboard/actions";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import { DashboardHeader } from "metabase/dashboard/components/DashboardHeader";
import type {
  CancelledFetchDashboardResult,
  DashboardDisplayOptionControls,
  FetchDashboardResult,
  SuccessfulFetchDashboardResult,
} from "metabase/dashboard/types";
import Bookmarks from "metabase/entities/bookmarks";
import Dashboards from "metabase/entities/dashboards";
import { useDispatch } from "metabase/lib/redux";
import { getHasDataAccess, getHasNativeWrite } from "metabase/selectors/data";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Box, Flex } from "metabase/ui";
import type {
  CardId,
  DashCardId,
  DashCardVisualizationSettings,
  DashboardCard,
  DashboardId,
  DashboardTabId,
  Dashboard as IDashboard,
  ParameterId,
  ParameterValueOrArray,
  TemporalUnit,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";
import type {
  DashboardSidebarName,
  SelectedTabId,
  State,
} from "metabase-types/store";

import { DASHBOARD_PDF_EXPORT_ROOT_ID, SIDEBAR_NAME } from "../../constants";
import { DashboardGridConnected } from "../DashboardGrid";
import { DashboardParameterPanel } from "../DashboardParameterPanel";
import { DashboardSidebars } from "../DashboardSidebars";

import S from "./Dashboard.module.css";
import { DashboardLoadingAndErrorWrapper } from "./DashboardComponents";
import {
  DashboardEmptyState,
  DashboardEmptyStateWithoutAddPrompt,
} from "./DashboardEmptyState/DashboardEmptyState";

export type DashboardProps = {
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
  clickBehaviorSidebarDashcard: DashboardCard | null;
  isAddParameterPopoverOpen: boolean;
  sidebar: State["dashboard"]["sidebar"];
  isHeaderVisible: boolean;
  isAdditionalInfoVisible: boolean;
  selectedTabId: SelectedTabId;
  isNavigatingBackToDashboard: boolean;
  addCardOnLoad?: DashCardId;
  editingOnLoad?: string | string[] | boolean;
  autoScrollToDashcardId: DashCardId | undefined;
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

  setParameterName: (id: ParameterId, name: string) => void;
  setParameterType: (id: ParameterId, type: string, sectionId: string) => void;
  navigateToNewCardFromDashboard: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
  setParameterDefaultValue: (id: ParameterId, value: unknown) => void;
  setParameterRequired: (id: ParameterId, value: boolean) => void;
  setParameterTemporalUnits: (
    id: ParameterId,
    temporalUnits: TemporalUnit[],
  ) => void;
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
  setParameterFilteringParameters: (
    parameterId: ParameterId,
    filteringParameters: ParameterId[],
  ) => void;
  showAddParameterPopover: () => void;
  removeParameter: (id: ParameterId) => void;

  onReplaceAllDashCardVisualizationSettings: (
    id: DashCardId,
    settings: DashCardVisualizationSettings | null | undefined,
  ) => void;
  onUpdateDashCardVisualizationSettings: (
    id: DashCardId,
    settings: DashCardVisualizationSettings | null | undefined,
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
    queryParams: Query;
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

  reportAutoScrolledToDashcard: () => void;
} & DashboardDisplayOptionControls;

function Dashboard(props: DashboardProps) {
  const {
    addCardOnLoad,
    addCardToDashboard,
    autoScrollToDashcardId,
    cancelFetchDashboardCardData,
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
    reportAutoScrolledToDashcard,
    selectedTabId,
    setEditingDashboard,
    setErrorPage,
    setSharing,
    toggleSidebar,
    parameterQueryParams,
    downloadsEnabled = true,
    noLoaderWrapper = false,
  } = props;

  const dispatch = useDispatch();

  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<unknown>(null);

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

  const { data: databasesResponse } = useListDatabasesQuery();
  const databases = useMemo(
    () => databasesResponse?.data ?? [],
    [databasesResponse],
  );
  const hasDataAccess = useMemo(() => getHasDataAccess(databases), [databases]);
  const hasNativeWrite = useMemo(
    () => getHasNativeWrite(databases),
    [databases],
  );
  const canCreateQuestions = hasDataAccess || hasNativeWrite;

  const shouldRenderAsNightMode = isNightMode && isFullscreen;

  const handleSetEditing = useCallback(
    (dashboard: IDashboard | null) => {
      if (!isEditing) {
        onRefreshPeriodChange(null);
        setEditingDashboard(dashboard);
      }
    },
    [isEditing, onRefreshPeriodChange, setEditingDashboard],
  );

  const handleAddQuestion = useCallback(() => {
    handleSetEditing(dashboard);
    toggleSidebar(SIDEBAR_NAME.addQuestion);
  }, [handleSetEditing, dashboard, toggleSidebar]);

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
        if (!isCancelledFetchDashboardResult(result)) {
          setErrorPage(result.payload);
        }
        return;
      }

      try {
        const dashboard = result.payload.dashboard;

        if (editingOnLoad) {
          onRefreshPeriodChange(null);
          setEditingDashboard(dashboard);
        }
        if (addCardOnLoad != null) {
          const searchParams = new URLSearchParams(window.location.search);
          const tabParam = searchParams.get("tab");
          const tabId = tabParam ? parseInt(tabParam, 10) : null;

          addCardToDashboard({
            dashId: dashboardId,
            cardId: addCardOnLoad,
            tabId,
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

  useUnmount(() => {
    cancelFetchDashboardCardData();
  });

  const renderEmptyStates = () => {
    if (!dashboardHasCards) {
      return canWrite ? (
        <DashboardEmptyState
          canCreateQuestions={canCreateQuestions}
          addQuestion={handleAddQuestion}
          isDashboardEmpty={true}
          isEditing={isEditing}
          isNightMode={shouldRenderAsNightMode}
        />
      ) : (
        <DashboardEmptyStateWithoutAddPrompt
          isDashboardEmpty={true}
          isNightMode={shouldRenderAsNightMode}
        />
      );
    }

    if (dashboardHasCards && !tabHasCards) {
      return canWrite ? (
        <DashboardEmptyState
          canCreateQuestions={canCreateQuestions}
          addQuestion={handleAddQuestion}
          isDashboardEmpty={false}
          isEditing={isEditing}
          isNightMode={shouldRenderAsNightMode}
        />
      ) : (
        <DashboardEmptyStateWithoutAddPrompt
          isDashboardEmpty={false}
          isNightMode={shouldRenderAsNightMode}
        />
      );
    }
  };

  return (
    <DashboardLoadingAndErrorWrapper
      isFullHeight={isEditing || isSharing}
      isFullscreen={isFullscreen}
      isNightMode={shouldRenderAsNightMode}
      loading={!dashboard}
      error={error}
      noWrapper={noLoaderWrapper}
    >
      {() => {
        if (!dashboard) {
          return null;
        }

        const isEmpty =
          !dashboardHasCards || (dashboardHasCards && !tabHasCards);

        return (
          <Flex direction="column" mih="100%" w="100%" flex="1 0 auto">
            {dashboard.archived && (
              <ArchivedEntityBanner
                name={dashboard.name}
                entityType="dashboard"
                canMove={canWrite}
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

            <Box
              component="header"
              className={cx(S.DashboardHeaderContainer, {
                [S.isFullscreen]: isFullscreen,
                [S.isNightMode]: shouldRenderAsNightMode,
              })}
              data-element-id="dashboard-header-container"
              data-testid="dashboard-header-container"
            >
              {/**
               * Do not conditionally render `<DashboardHeader />` as it calls
               * `useDashboardTabs` under the hood. This hook sets `selectedTabId`
               * in Redux state which kicks off a fetch for the dashboard cards.
               */}
              <DashboardHeader
                parameterQueryParams={parameterQueryParams}
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
            </Box>

            <Flex
              pos="relative"
              miw={0}
              mih={0}
              className={cx(S.DashboardBody, {
                [S.isEditingOrSharing]: isEditing || isSharing,
              })}
            >
              <Box
                className={cx(S.ParametersAndCardsContainer, {
                  [S.shouldMakeDashboardHeaderStickyAfterScrolling]:
                    !isFullscreen && (isEditing || isSharing),
                  [S.notEmpty]: !isEmpty,
                })}
                id={DASHBOARD_PDF_EXPORT_ROOT_ID}
                data-element-id="dashboard-parameters-and-cards"
                data-testid="dashboard-parameters-and-cards"
              >
                <DashboardParameterPanel isFullscreen={isFullscreen} />
                {isEmpty ? (
                  renderEmptyStates()
                ) : (
                  <FullWidthContainer
                    className={S.CardsContainer}
                    data-element-id="dashboard-cards-container"
                  >
                    <DashboardGridConnected
                      clickBehaviorSidebarDashcard={
                        props.clickBehaviorSidebarDashcard
                      }
                      isNightMode={shouldRenderAsNightMode}
                      isFullscreen={props.isFullscreen}
                      isEditingParameter={props.isEditingParameter}
                      isEditing={props.isEditing}
                      dashboard={dashboard}
                      slowCards={props.slowCards}
                      navigateToNewCardFromDashboard={
                        props.navigateToNewCardFromDashboard
                      }
                      selectedTabId={selectedTabId}
                      downloadsEnabled={downloadsEnabled}
                      autoScrollToDashcardId={autoScrollToDashcardId}
                      reportAutoScrolledToDashcard={
                        reportAutoScrolledToDashcard
                      }
                    />
                  </FullWidthContainer>
                )}
              </Box>

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
                sidebar={props.sidebar}
                closeSidebar={props.closeSidebar}
                selectedTabId={selectedTabId}
                onCancel={() => setSharing(false)}
              />
            </Flex>
          </Flex>
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

export function isCancelledFetchDashboardResult(
  result: FetchDashboardResult,
): result is CancelledFetchDashboardResult {
  return isObject(result.payload) && Boolean(result.payload.isCancelled);
}

export { Dashboard };
