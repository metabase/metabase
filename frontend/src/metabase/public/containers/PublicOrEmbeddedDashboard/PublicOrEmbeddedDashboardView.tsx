import cx from "classnames";
import { assoc } from "icepick";
import { useCallback } from "react";
import _ from "underscore";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import ColorS from "metabase/css/core/colors.module.css";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { DashboardEmptyStateWithoutAddPrompt } from "metabase/dashboard/components/Dashboard/DashboardEmptyState/DashboardEmptyState";
import { DashboardGridConnected } from "metabase/dashboard/components/DashboardGrid";
import { DashboardHeaderButtonRow } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/DashboardHeaderButtonRow";
import { DASHBOARD_DISPLAY_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { DashboardTabs } from "metabase/dashboard/components/DashboardTabs";
import { useDashboardContext } from "metabase/dashboard/context";
import { isActionDashCard } from "metabase/dashboard/utils";
import { SetTitle } from "metabase/hoc/Title";
import { isWithinIframe } from "metabase/lib/dom";
import ParametersS from "metabase/parameters/components/ParameterValueWidget.module.css";
import type { DisplayTheme } from "metabase/public/lib/types";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import type { ClickActionModeGetter } from "metabase/visualizations/types";
import type { DashboardCard } from "metabase-types/api";

import { EmbedFrame } from "../../components/EmbedFrame";
import { getTabHiddenParameterSlugs } from "../../lib/tab-parameters";

export function PublicOrEmbeddedDashboardView() {
  const {
    setParameterValue,
    setParameterValueToDefault,
    dashboard,
    hasNightModeToggle,
    isFullscreen,
    isNightMode,
    onFullscreenChange,
    onNightModeChange,
    onRefreshPeriodChange,
    refreshPeriod,
    setRefreshElapsedHook,
    selectedTabId,
    parameters,
    parameterValues,
    draftParameterValues,
    dashboardId,
    background,
    bordered,
    titled,
    theme,
    getClickActionMode: externalGetClickActionMode,
    hideParameters,
    withFooter,
    navigateToNewCardFromDashboard,
    slowCards,
    downloadsEnabled,
  } = useDashboardContext();

  const buttons = !isWithinIframe() ? (
    <DashboardHeaderButtonRow
      canResetFilters={false}
      onResetFilters={_.noop}
      dashboardActionKeys={DASHBOARD_DISPLAY_ACTIONS}
      refreshPeriod={refreshPeriod}
      onRefreshPeriodChange={onRefreshPeriodChange}
      onFullscreenChange={onFullscreenChange}
      setRefreshElapsedHook={setRefreshElapsedHook}
      isFullscreen={isFullscreen}
      hasNightModeToggle={hasNightModeToggle}
      onNightModeChange={onNightModeChange}
      isNightMode={isNightMode}
      isPublic={true}
    />
  ) : null;

  const visibleDashcards = (dashboard?.dashcards ?? []).filter(
    (dashcard) => !isActionDashCard(dashcard),
  );

  const dashboardHasCards = dashboard && visibleDashcards.length > 0;
  const dashboardHasTabs = dashboard?.tabs && dashboard.tabs.length > 1;
  const hasVisibleParameters = parameters.filter((p) => !p.hidden).length > 0;

  const tabHasCards =
    visibleDashcards.filter(
      (dc: DashboardCard) => dc.dashboard_tab_id === selectedTabId,
    ).length > 0;

  const hiddenParameterSlugs = getTabHiddenParameterSlugs({
    parameters,
    dashboard,
    selectedTabId,
  });

  const normalizedTheme = normalizeTheme({
    theme,
    background,
  });

  const getClickActionMode: ClickActionModeGetter = useCallback(
    ({ question }) =>
      externalGetClickActionMode?.({ question }) ??
      getEmbeddingMode({
        question,
        queryMode: navigateToNewCardFromDashboard
          ? EmbeddingSdkMode
          : PublicMode,
      }),
    [externalGetClickActionMode, navigateToNewCardFromDashboard],
  );

  const isCompactHeader = !titled && !hasVisibleParameters && !dashboardHasTabs;

  return (
    <EmbedFrame
      name={dashboard && dashboard.name}
      description={dashboard && dashboard.description}
      dashboard={dashboard}
      parameters={parameters}
      parameterValues={parameterValues}
      draftParameterValues={draftParameterValues}
      hiddenParameterSlugs={hiddenParameterSlugs}
      setParameterValue={setParameterValue}
      setParameterValueToDefault={setParameterValueToDefault}
      enableParameterRequiredBehavior
      actionButtons={buttons ? <div className={CS.flex}>{buttons}</div> : null}
      dashboardTabs={dashboardId && dashboardHasTabs && <DashboardTabs />}
      background={background}
      bordered={bordered}
      titled={titled}
      theme={normalizedTheme}
      hide_parameters={hideParameters}
      pdfDownloadsEnabled={downloadsEnabled.pdf}
      withFooter={withFooter}
    >
      {dashboard && <SetTitle title={dashboard.name} />}
      <LoadingAndErrorWrapper
        className={cx({
          [DashboardS.DashboardFullscreen]: isFullscreen,
          [DashboardS.DashboardNight]: isNightMode,
          [ParametersS.DashboardNight]: isNightMode,
          [ColorS.DashboardNight]: isNightMode,
        })}
        loading={!dashboard}
      >
        {() => {
          if (!dashboard) {
            return null;
          }

          if (!dashboardHasCards) {
            return (
              <DashboardEmptyStateWithoutAddPrompt
                isNightMode={isNightMode}
                isDashboardEmpty={true}
              />
            );
          }

          if (dashboardHasCards && !tabHasCards) {
            return (
              <DashboardEmptyStateWithoutAddPrompt
                isNightMode={isNightMode}
                isDashboardEmpty={false}
              />
            );
          }

          return (
            <FullWidthContainer mt={isCompactHeader ? "xs" : "sm"}>
              <DashboardGridConnected
                dashboard={assoc(dashboard, "dashcards", visibleDashcards)}
                isPublicOrEmbedded
                getClickActionMode={getClickActionMode}
                selectedTabId={selectedTabId}
                slowCards={slowCards}
                isEditing={false}
                isEditingParameter={false}
                isXray={false}
                isFullscreen={isFullscreen}
                isNightMode={isNightMode}
                clickBehaviorSidebarDashcard={null}
                navigateToNewCardFromDashboard={
                  navigateToNewCardFromDashboard ?? null
                }
                downloadsEnabled={downloadsEnabled}
                autoScrollToDashcardId={undefined}
                reportAutoScrolledToDashcard={_.noop}
              />
            </FullWidthContainer>
          );
        }}
      </LoadingAndErrorWrapper>
    </EmbedFrame>
  );
}

/**
 * When both `background: false` and `theme: "transparent"` options are supplied,
 * the new behavior takes precedence (metabase#43838)
 */
function normalizeTheme({
  theme,
  background,
}: {
  theme: DisplayTheme;
  background: boolean;
}) {
  if (!background && theme === "transparent") {
    return "light";
  }

  return theme;
}
