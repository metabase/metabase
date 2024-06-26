import cx from "classnames";
import { assoc } from "icepick";
import type { HandleThunkActionCreator } from "react-redux";

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
import { getDashboardActions } from "metabase/dashboard/components/DashboardActions";
import { DashboardGridConnected } from "metabase/dashboard/components/DashboardGrid";
import { DashboardTabs } from "metabase/dashboard/components/DashboardTabs";
import type {
  DashboardFullscreenControls,
  DashboardRefreshPeriodControls,
  EmbedHideDownloadButton,
  EmbedHideParameters,
  EmbedThemeControls,
  RefreshPeriod,
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
  bordered,
  titled,
  theme,
  hideParameters,
  hideDownloadButton,
  navigateToNewCardFromDashboard,
  slowCards,
  cardTitled,
}: {
  dashboard: Dashboard | null;
  hasNightModeToggle?: boolean;
  isFullscreen: boolean;
  isNightMode: boolean;
  onFullscreenChange: DashboardFullscreenControls["onFullscreenChange"];
  onNightModeChange: EmbedThemeControls["onNightModeChange"];
  onRefreshPeriodChange: DashboardRefreshPeriodControls["onRefreshPeriodChange"];
  refreshPeriod: RefreshPeriod;
  setRefreshElapsedHook: DashboardRefreshPeriodControls["setRefreshElapsedHook"];
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
  bordered: boolean;
  titled: boolean;
  theme: DisplayTheme;
  hideParameters: EmbedHideParameters;
  hideDownloadButton: EmbedHideDownloadButton;
  navigateToNewCardFromDashboard?: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
  slowCards: Record<number, boolean>;
  cardTitled: boolean;
}) {
  const buttons = !isWithinIframe()
    ? getDashboardActions({
        dashboard,
        hasNightModeToggle,
        isFullscreen,
        isNightMode,
        onFullscreenChange,
        onNightModeChange,
        onRefreshPeriodChange,
        refreshPeriod,
        setRefreshElapsedHook,
        isPublic: true,
      })
    : [];

  const visibleDashcards = (dashboard?.dashcards ?? []).filter(
    dashcard => !isActionDashCard(dashcard),
  );

  const dashboardHasCards = dashboard && visibleDashcards.length > 0;

  const tabHasCards =
    visibleDashcards.filter(
      (dc: DashboardCard) => dc.dashboard_tab_id === selectedTabId,
    ).length > 0;

  const hiddenParameterSlugs = getHiddenParameterSlugs({
    parameters,
    dashboard,
    selectedTabId,
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
      actionButtons={
        buttons.length > 0 && <div className={CS.flex}>{buttons}</div>
      }
      dashboardTabs={
        dashboard?.tabs &&
        dashboard.tabs.length > 1 && <DashboardTabs dashboardId={dashboardId} />
      }
      bordered={bordered}
      titled={titled}
      theme={theme}
      hide_parameters={hideParameters}
      hide_download_button={hideDownloadButton}
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
              />
            </DashboardContainer>
          );
        }}
      </LoadingAndErrorWrapper>
    </EmbedFrame>
  );
}

function getHiddenParameterSlugs({
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
