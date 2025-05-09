import cx from "classnames";

import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import { DashboardHeader } from "metabase/dashboard/components/DashboardHeader";
import { useDashboardContext } from "metabase/dashboard/context";
import Bookmarks from "metabase/entities/bookmarks";
import Dashboards from "metabase/entities/dashboards";
import { useDispatch } from "metabase/lib/redux";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Box, Flex } from "metabase/ui";

import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "../../constants";
import { DashboardGridConnected } from "../DashboardGrid";
import { DashboardParameterPanel } from "../DashboardParameterPanel";
import { DashboardSidebars } from "../DashboardSidebars";

import S from "./Dashboard.module.css";
import { DashboardLoadingAndErrorWrapper } from "./DashboardComponents";

function Dashboard() {
  const {
    dashboard,
    isEditing,
    isFullscreen,
    isSharing,
    onRefreshPeriodChange,
    selectedTabId,
    setSharing,
    parameterQueryParams = {},
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
  } = useDashboardContext();

  const canWrite = Boolean(dashboard?.can_write);
  const canRestore = Boolean(dashboard?.can_restore);
  const canDelete = Boolean(dashboard?.can_delete);

  const dispatch = useDispatch();
  const invalidateBookmarks = async () =>
    await dispatch(Bookmarks.actions.invalidateLists());

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
                })}
                id={DASHBOARD_PDF_EXPORT_ROOT_ID}
                data-element-id="dashboard-parameters-and-cards"
                data-testid="dashboard-parameters-and-cards"
              >
                <DashboardParameterPanel isFullscreen={isFullscreen} />
                <FullWidthContainer
                  className={S.CardsContainer}
                  data-element-id="dashboard-cards-container"
                >
                  <DashboardGridConnected />
                </FullWidthContainer>
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
