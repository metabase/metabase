import cx from "classnames";
import type { Query } from "history";
import { assoc } from "icepick";
import { type ComponentType, Component } from "react";
import type { ConnectedProps } from "react-redux";
import { connect } from "react-redux";
import _ from "underscore";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ColorS from "metabase/css/core/colors.module.css";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import {
  cancelFetchDashboardCardData,
  fetchDashboard,
  fetchDashboardCardData,
  initialize,
  setParameterValue,
  setParameterValueToDefault,
} from "metabase/dashboard/actions";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import { DashboardEmptyStateWithoutAddPrompt } from "metabase/dashboard/components/Dashboard/DashboardEmptyState/DashboardEmptyState";
import { getDashboardActions } from "metabase/dashboard/components/DashboardActions";
import { DashboardGridConnected } from "metabase/dashboard/components/DashboardGrid";
import { DashboardTabs } from "metabase/dashboard/components/DashboardTabs";
import { DashboardControls } from "metabase/dashboard/hoc/DashboardControls";
import {
  getDashboardComplete,
  getDraftParameterValues,
  getParameters,
  getParameterValues,
  getSelectedTabId,
  getSlowCards,
} from "metabase/dashboard/selectors";
import type {
  DashboardDisplayOptionControls,
  EmbedDisplayParams,
  FetchDashboardResult,
  SuccessfulFetchDashboardResult,
} from "metabase/dashboard/types";
import { isActionDashCard } from "metabase/dashboard/utils";
import title from "metabase/hoc/Title";
import { isWithinIframe } from "metabase/lib/dom";
import ParametersS from "metabase/parameters/components/ParameterValueWidget.module.css";
import { WithPublicDashboardEndpoints } from "metabase/public/containers/PublicOrEmbeddedDashboard/WithPublicDashboardEndpoints";
import { setErrorPage } from "metabase/redux/app";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Dashboard, DashboardCard, DashboardId } from "metabase-types/api";
import type { SelectedTabId, State } from "metabase-types/store";

import { EmbedFrame } from "../../components/EmbedFrame";

import { DashboardContainer } from "./PublicOrEmbeddedDashboard.styled";

const mapStateToProps = (state: State) => {
  return {
    dashboard: getDashboardComplete(state),
    slowCards: getSlowCards(state),
    parameters: getParameters(state),
    parameterValues: getParameterValues(state),
    draftParameterValues: getDraftParameterValues(state),
    selectedTabId: getSelectedTabId(state),
  };
};

const mapDispatchToProps = {
  initialize,
  cancelFetchDashboardCardData,
  setParameterValueToDefault,
  setParameterValue,
  setErrorPage,
  fetchDashboard,
  fetchDashboardCardData,
};

const connector = connect(mapStateToProps, mapDispatchToProps);

type ReduxProps = ConnectedProps<typeof connector>;

type OwnProps = {
  dashboardId: DashboardId;
  parameterQueryParams: Query;

  navigateToNewCardFromDashboard?: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
};

type DisplayProps = Pick<
  DashboardDisplayOptionControls,
  | "isFullscreen"
  | "isNightMode"
  | "onFullscreenChange"
  | "onNightModeChange"
  | "onRefreshPeriodChange"
  | "refreshPeriod"
  | "setRefreshElapsedHook"
  | "hasNightModeToggle"
>;

type PublicOrEmbeddedDashboardProps = OwnProps &
  ReduxProps &
  DisplayProps &
  EmbedDisplayParams;

class PublicOrEmbeddedDashboardInner extends Component<PublicOrEmbeddedDashboardProps> {
  _initialize = async () => {
    const {
      initialize,
      fetchDashboard,
      fetchDashboardCardData,
      setErrorPage,
      parameterQueryParams,
      dashboardId,
    } = this.props;

    initialize();

    const result = await fetchDashboard({
      dashId: String(dashboardId),
      queryParams: parameterQueryParams,
    });

    if (!isSuccessfulFetchDashboardResult(result)) {
      setErrorPage(result.payload);
      return;
    }

    try {
      if (this.props.dashboard?.tabs?.length === 0) {
        await fetchDashboardCardData({ reload: false, clearCache: true });
      }
    } catch (error) {
      console.error(error);
      setErrorPage(error);
    }
  };

  async componentDidMount() {
    await this._initialize();
  }

  componentWillUnmount() {
    this.props.cancelFetchDashboardCardData();
  }

  async componentDidUpdate(prevProps: PublicOrEmbeddedDashboardProps) {
    if (this.props.dashboardId !== prevProps.dashboardId) {
      return this._initialize();
    }

    if (!_.isEqual(prevProps.selectedTabId, this.props.selectedTabId)) {
      this.props.fetchDashboardCardData();
      return;
    }

    if (!_.isEqual(this.props.parameterValues, prevProps.parameterValues)) {
      this.props.fetchDashboardCardData({ reload: false, clearCache: true });
    }
  }

  render() {
    const {
      dashboard,
      parameters,
      parameterValues,
      draftParameterValues,
      isFullscreen,
      isNightMode = false,
      setParameterValueToDefault,
      onFullscreenChange,
      onNightModeChange,
      onRefreshPeriodChange,
      refreshPeriod,
      setRefreshElapsedHook,
      hasNightModeToggle,
      bordered,
      titled,
      theme,
      hideDownloadButton,
      hideParameters,
      navigateToNewCardFromDashboard,
      selectedTabId,
      setParameterValue,
      slowCards,
      dashboardId,
      cardTitled,
    } = this.props;

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

    const getCurrentTabDashcards = ({
      dashboard,
      selectedTabId,
    }: {
      dashboard: Dashboard | null;
      selectedTabId: SelectedTabId;
    }) => {
      // const  = this.props;
      if (!Array.isArray(dashboard?.dashcards)) {
        return [];
      }
      if (!selectedTabId) {
        return dashboard?.dashcards;
      }
      return dashboard?.dashcards.filter(
        dashcard => dashcard.dashboard_tab_id === selectedTabId,
      );
    };

    const getHiddenParameterSlugs = ({
      parameters,
      dashboard,
      selectedTabId,
    }: {
      parameters: UiParameter[];
      dashboard: Dashboard | null;
      selectedTabId: SelectedTabId;
    }) => {
      const currentTabParameterIds =
        getCurrentTabDashcards({ dashboard, selectedTabId })?.flatMap(
          dashcard =>
            dashcard.parameter_mappings?.map(mapping => mapping.parameter_id) ??
            [],
        ) ?? [];
      const hiddenParameters = parameters.filter(
        parameter => !currentTabParameterIds.includes(parameter.id),
      );
      return hiddenParameters.map(parameter => parameter.slug).join(",");
    };

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
          buttons.length > 0 ? <div className={CS.flex}>{buttons}</div> : null
        }
        dashboardTabs={
          dashboard?.tabs &&
          dashboard.tabs.length > 1 && (
            <DashboardTabs dashboardId={dashboardId} />
          )
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
                <DashboardEmptyStateWithoutAddPrompt
                  isNightMode={isNightMode}
                />
              );
            }

            return (
              <DashboardContainer>
                <DashboardGridConnected
                  dashboard={assoc(dashboard, "dashcards", visibleDashcards)}
                  isPublicOrEmbedded
                  mode={
                    navigateToNewCardFromDashboard
                      ? EmbeddingSdkMode
                      : PublicMode
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
                  navigateToNewCardFromDashboard={
                    navigateToNewCardFromDashboard
                  }
                />
              </DashboardContainer>
            );
          }}
        </LoadingAndErrorWrapper>
      </EmbedFrame>
    );
  }
}

function isSuccessfulFetchDashboardResult(
  result: FetchDashboardResult,
): result is SuccessfulFetchDashboardResult {
  const hasError = "error" in result;
  return !hasError;
}

// Raw PublicOrEmbeddedDashboard used for SDK embedding
export const PublicOrEmbeddedDashboard = connector(
  PublicOrEmbeddedDashboardInner,
);

// PublicDashboardControlled used for embedding with location
// Uses DashboardControls to handle display options, and uses WithPublicDashboardEndpoints to set endpoints for public/embed contexts
export const PublicOrEmbeddedDashboardControlled = _.compose(
  title(
    ({ dashboard }: { dashboard: Dashboard }) => dashboard && dashboard.name,
  ),
  WithPublicDashboardEndpoints,
  DashboardControls,
)(PublicOrEmbeddedDashboard) as ComponentType<OwnProps>;
