import type { Query } from "history";
import { type ComponentType, Component } from "react";
import type { ConnectedProps } from "react-redux";
import { connect } from "react-redux";
import _ from "underscore";

import {
  cancelFetchDashboardCardData,
  fetchDashboard,
  fetchDashboardCardData,
  initialize,
  setParameterValue,
  setParameterValueToDefault,
  reset,
} from "metabase/dashboard/actions";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import { DashboardControls } from "metabase/dashboard/hoc/DashboardControls";
import {
  getDashboardComplete,
  getDraftParameterValues,
  getIsNavigatingBackToDashboard,
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
import title from "metabase/hoc/Title";
import { WithPublicDashboardEndpoints } from "metabase/public/containers/PublicOrEmbeddedDashboard/WithPublicDashboardEndpoints";
import { setErrorPage } from "metabase/redux/app";
import type { Dashboard, DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { PublicOrEmbeddedDashboardView } from "./PublicOrEmbeddedDashboardView";

const mapStateToProps = (state: State) => {
  return {
    dashboard: getDashboardComplete(state),
    slowCards: getSlowCards(state),
    parameters: getParameters(state),
    parameterValues: getParameterValues(state),
    draftParameterValues: getDraftParameterValues(state),
    selectedTabId: getSelectedTabId(state),
    isNavigatingBackToDashboard: getIsNavigatingBackToDashboard(state),
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
  reset,
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
      isNavigatingBackToDashboard,
    } = this.props;

    const shouldReloadDashboardData = !isNavigatingBackToDashboard;

    initialize({ clearCache: shouldReloadDashboardData });

    const result = await fetchDashboard({
      dashId: String(dashboardId),
      queryParams: parameterQueryParams,
      options: {
        clearCache: shouldReloadDashboardData,
      },
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
    this.props.reset();
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

    return (
      <PublicOrEmbeddedDashboardView
        dashboard={dashboard}
        hasNightModeToggle={hasNightModeToggle}
        isFullscreen={isFullscreen}
        isNightMode={isNightMode}
        onFullscreenChange={onFullscreenChange}
        onNightModeChange={onNightModeChange}
        onRefreshPeriodChange={onRefreshPeriodChange}
        refreshPeriod={refreshPeriod}
        setRefreshElapsedHook={setRefreshElapsedHook}
        selectedTabId={selectedTabId}
        parameters={parameters}
        parameterValues={parameterValues}
        draftParameterValues={draftParameterValues}
        setParameterValue={setParameterValue}
        setParameterValueToDefault={setParameterValueToDefault}
        dashboardId={dashboardId}
        bordered={bordered}
        titled={titled}
        theme={theme}
        hideParameters={hideParameters}
        hideDownloadButton={hideDownloadButton}
        navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
        slowCards={slowCards}
        cardTitled={cardTitled}
      />
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
