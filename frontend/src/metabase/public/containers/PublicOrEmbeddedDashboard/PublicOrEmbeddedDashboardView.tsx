import cx from "classnames";
import _ from "underscore";

import ColorS from "metabase/css/core/colors.module.css";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { Grid } from "metabase/dashboard/components/Dashboard/components/Grid";
import { DashboardHeaderButtonRow } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/DashboardHeaderButtonRow";
import { DASHBOARD_DISPLAY_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { DashboardTabs } from "metabase/dashboard/components/DashboardTabs";
import { useDashboardContext } from "metabase/dashboard/context";
import { SetTitle } from "metabase/hoc/Title";
import { isWithinIframe } from "metabase/lib/dom";
import ParametersS from "metabase/parameters/components/ParameterValueWidget.module.css";
import type { DisplayTheme } from "metabase/public/lib/types";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Dashboard } from "metabase-types/api";
import type { SelectedTabId } from "metabase-types/store";

import { EmbedFrame } from "../../components/EmbedFrame";

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
    hideParameters,
    withFooter,
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

  const dashboardHasTabs = dashboard?.tabs && dashboard.tabs.length > 1;
  const hasVisibleParameters = parameters.filter((p) => !p.hidden).length > 0;

  const hiddenParameterSlugs = getTabHiddenParameterSlugs({
    parameters,
    dashboard,
    selectedTabId,
  });

  const normalizedTheme = normalizeTheme({
    theme,
    background,
  });

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
      <FullWidthContainer
        className={cx({
          [DashboardS.DashboardFullscreen]: isFullscreen,
          [DashboardS.DashboardNight]: isNightMode,
          [ParametersS.DashboardNight]: isNightMode,
          [ColorS.DashboardNight]: isNightMode,
        })}
        mt={isCompactHeader ? "xs" : "sm"}
      >
        <Grid />
      </FullWidthContainer>
    </EmbedFrame>
  );
}

function getTabHiddenParameterSlugs({
  parameters,
  dashboard,
  selectedTabId,
}: {
  parameters: UiParameter[];
  dashboard: Dashboard | null;
  selectedTabId: SelectedTabId;
}) {
  const currentTabParameterIds =
    getCurrentTabDashcards({ dashboard, selectedTabId })?.flatMap(
      (dashcard) =>
        dashcard.parameter_mappings?.map((mapping) => mapping.parameter_id) ??
        [],
    ) ?? [];
  const hiddenParameters = parameters.filter(
    (parameter) => !currentTabParameterIds.includes(parameter.id),
  );
  return hiddenParameters.map((parameter) => parameter.slug).join(",");
}

function getCurrentTabDashcards({
  dashboard,
  selectedTabId,
}: {
  dashboard: Dashboard | null;
  selectedTabId: SelectedTabId;
}) {
  if (!Array.isArray(dashboard?.dashcards)) {
    return [];
  }
  if (!selectedTabId) {
    return dashboard?.dashcards;
  }
  return dashboard?.dashcards.filter(
    (dashcard) => dashcard.dashboard_tab_id === selectedTabId,
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
