import cx from "classnames";
import { useCallback, useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import { DashboardHeader } from "metabase/dashboard/components/DashboardHeader";
import { useDashboardContext } from "metabase/dashboard/context";
import Bookmarks from "metabase/entities/bookmarks";
import Dashboards from "metabase/entities/dashboards";
import { useDispatch } from "metabase/lib/redux";
import { getHasDataAccess, getHasNativeWrite } from "metabase/selectors/data";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Box, Flex } from "metabase/ui";
import type {
  DashboardCard,
  Dashboard as IDashboard,
} from "metabase-types/api";

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

function Dashboard() {
  const {
    autoScrollToDashcardId,
    dashboard,
    isEditing,
    isFullscreen,
    isSharing,
    onRefreshPeriodChange,
    reportAutoScrolledToDashcard,
    selectedTabId,
    setSharing,
    parameterQueryParams = {},
    downloadsEnabled,
    shouldRenderAsNightMode,
    setArchivedDashboard,
    moveDashboardToCollection,
    deletePermanently,

    dashboardBeforeEditing,
    onFullscreenChange,
    isAdditionalInfoVisible,
    hasNightModeToggle,
    onNightModeChange,
    refreshPeriod,
    setRefreshElapsedHook,

    isEditingParameter,
    slowCards,
    navigateToNewCardFromDashboard,
    removeParameter,
    addCardToDashboard,
    clickBehaviorSidebarDashcard,
    onReplaceAllDashCardVisualizationSettings,
    onUpdateDashCardVisualizationSettings,
    onUpdateDashCardColumnSettings,
    setParameterName,
    setParameterType,
    setParameterDefaultValue,
    setParameterIsMultiSelect,
    setParameterQueryType,
    setParameterSourceType,
    setParameterSourceConfig,
    setParameterFilteringParameters,
    setParameterRequired,
    setParameterTemporalUnits,
    sidebar,
    closeSidebar,
    toggleSidebar,
    setEditingDashboard,
  } = useDashboardContext();

  const canWrite = Boolean(dashboard?.can_write);
  const canRestore = Boolean(dashboard?.can_restore);
  const canDelete = Boolean(dashboard?.can_delete);

  const dispatch = useDispatch();
  const invalidateBookmarks = async () =>
    await dispatch(Bookmarks.actions.invalidateLists());

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
                  await setArchivedDashboard(false);
                  await invalidateBookmarks();
                }}
                onMove={({ id }) => moveDashboardToCollection({ id })}
                onDeletePermanently={() => {
                  const { id } = dashboard;
                  const deleteAction = Dashboards.actions.delete({ id });
                  deletePermanently(deleteAction);
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
                dashboardBeforeEditing={dashboardBeforeEditing}
                onFullscreenChange={onFullscreenChange}
                isAdditionalInfoVisible={isAdditionalInfoVisible}
                hasNightModeToggle={hasNightModeToggle}
                onNightModeChange={onNightModeChange}
                refreshPeriod={refreshPeriod}
                setRefreshElapsedHook={setRefreshElapsedHook}
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
                        clickBehaviorSidebarDashcard
                      }
                      isNightMode={shouldRenderAsNightMode}
                      isFullscreen={isFullscreen}
                      isEditingParameter={isEditingParameter}
                      isEditing={isEditing}
                      dashboard={dashboard}
                      slowCards={slowCards}
                      navigateToNewCardFromDashboard={
                        navigateToNewCardFromDashboard
                      }
                      selectedTabId={selectedTabId}
                      downloadsEnabled={downloadsEnabled}
                      autoScrollToDashcardId={autoScrollToDashcardId}
                      reportAutoScrolledToDashcard={
                        reportAutoScrolledToDashcard
                      }
                      handleSetEditing={handleSetEditing}
                    />
                  </FullWidthContainer>
                )}
              </Box>

              <DashboardSidebars
                dashboard={dashboard}
                removeParameter={removeParameter}
                addCardToDashboard={addCardToDashboard}
                clickBehaviorSidebarDashcard={clickBehaviorSidebarDashcard}
                onReplaceAllDashCardVisualizationSettings={
                  onReplaceAllDashCardVisualizationSettings
                }
                onUpdateDashCardVisualizationSettings={
                  onUpdateDashCardVisualizationSettings
                }
                onUpdateDashCardColumnSettings={onUpdateDashCardColumnSettings}
                setParameterName={setParameterName}
                setParameterType={setParameterType}
                setParameterDefaultValue={setParameterDefaultValue}
                setParameterIsMultiSelect={setParameterIsMultiSelect}
                setParameterQueryType={setParameterQueryType}
                setParameterSourceType={setParameterSourceType}
                setParameterSourceConfig={setParameterSourceConfig}
                setParameterFilteringParameters={
                  setParameterFilteringParameters
                }
                setParameterRequired={setParameterRequired}
                setParameterTemporalUnits={setParameterTemporalUnits}
                isFullscreen={isFullscreen}
                sidebar={sidebar}
                closeSidebar={closeSidebar}
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
export { Dashboard };
