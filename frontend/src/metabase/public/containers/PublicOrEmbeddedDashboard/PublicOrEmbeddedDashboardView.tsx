import cx from "classnames";
import { assoc } from "icepick";
import type { HandleThunkActionCreator } from "react-redux";
import _ from "underscore";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ColorS from "metabase/css/core/colors.module.css";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import type {
  setParameterValueToDefault as setParameterValueToDefaultDashboardAction,
  setParameterValue as setParameterValueDashboardAction,
} from "metabase/dashboard/actions";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import { DashboardEmptyStateWithoutAddPrompt } from "metabase/dashboard/components/Dashboard/DashboardEmptyState/DashboardEmptyState";
import { DashboardGridConnected } from "metabase/dashboard/components/DashboardGrid";
import { DashboardHeaderButtonRow } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/DashboardHeaderButtonRow";
import { DASHBOARD_DISPLAY_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { DashboardTabs } from "metabase/dashboard/components/DashboardTabs";
import type {
  DashboardFullscreenControls,
  DashboardRefreshPeriodControls,
  EmbedHideParameters,
  DashboardNightModeControls,
} from "metabase/dashboard/types";
import { isActionDashCard } from "metabase/dashboard/utils";
import { isWithinIframe } from "metabase/lib/dom";
import ParametersS from "metabase/parameters/components/ParameterValueWidget.module.css";
import type { DisplayTheme } from "metabase/public/lib/types";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  Dashboard,
  DashboardCard,
  DashboardId,
  ParameterValueOrArray,
} from "metabase-types/api";
import type { SelectedTabId } from "metabase-types/store";

import { EmbedFrame } from "../../components/EmbedFrame";

import { DashboardContainer } from "./PublicOrEmbeddedDashboard.styled";

export function PublicOrEmbeddedDashboardView({
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
  setParameterValue,
  setParameterValueToDefault,
  dashboardId,
  background,
  bordered,
  titled,
  theme,
  hideParameters,
  navigateToNewCardFromDashboard,
  slowCards,
  cardTitled,
  downloadsEnabled,
}: {
  dashboard: Dashboard | null;
  selectedTabId: SelectedTabId;
  parameters: UiParameter[];
  parameterValues: Record<string, ParameterValueOrArray>;
  draftParameterValues: Record<string, ParameterValueOrArray | null>;
  setParameterValue: HandleThunkActionCreator<
    typeof setParameterValueDashboardAction
  >;
  setParameterValueToDefault: HandleThunkActionCreator<
    typeof setParameterValueToDefaultDashboardAction
  >;
  dashboardId: DashboardId;
  background: boolean;
  bordered: boolean;
  titled: boolean;
  theme: DisplayTheme;
  hideParameters: EmbedHideParameters;
  navigateToNewCardFromDashboard?: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
  slowCards: Record<number, boolean>;
  cardTitled: boolean;
  downloadsEnabled: boolean;
} & DashboardRefreshPeriodControls &
  DashboardNightModeControls &
  DashboardFullscreenControls) {
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
    dashcard => !isActionDashCard(dashcard),
  );

  const dashboardHasCards = dashboard && visibleDashcards.length > 0;

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
      dashboardTabs={
        dashboard?.tabs &&
        dashboard.tabs.length > 1 && <DashboardTabs dashboardId={dashboardId} />
      }
      background={background}
      bordered={bordered}
      titled={titled}
      theme={normalizedTheme}
      hide_parameters={hideParameters}
      downloadsEnabled={downloadsEnabled}
    >
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

          if (!dashboardHasCards || !tabHasCards) {
            return (
              <DashboardEmptyStateWithoutAddPrompt isNightMode={isNightMode} />
            );
          }

          return (
            <DashboardContainer>
              <DashboardGridConnected
                dashboard={assoc(dashboard, "dashcards", visibleDashcards)}
                isPublicOrEmbedded
                mode={
                  navigateToNewCardFromDashboard ? EmbeddingSdkMode : PublicMode
                }
                selectedTabId={selectedTabId}
                slowCards={slowCards}
                isEditing={false}
                isEditingParameter={false}
                isXray={false}
                isFullscreen={isFullscreen}
                isNightMode={isNightMode}
                withCardTitle={cardTitled}
                clickBehaviorSidebarDashcard={null}
                navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
                downloadsEnabled={downloadsEnabled}
              />
            </DashboardContainer>
          );
        }}
      </LoadingAndErrorWrapper>
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
      dashcard =>
        dashcard.parameter_mappings?.map(mapping => mapping.parameter_id) ?? [],
    ) ?? [];
  const hiddenParameters = parameters.filter(
    parameter => !currentTabParameterIds.includes(parameter.id),
  );
  return hiddenParameters.map(parameter => parameter.slug).join(",");
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
    dashcard => dashcard.dashboard_tab_id === selectedTabId,
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
