import cx from "classnames";
import { assoc } from "icepick";
import type { ComponentType } from "react";
import { Component } from "react";
import type { ConnectedProps } from "react-redux";
import { connect } from "react-redux";
import _ from "underscore";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ColorS from "metabase/css/core/colors.module.css";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import {
  initialize,
  setParameterValueToDefault,
  setParameterValue,
  cancelFetchDashboardCardData,
  fetchDashboard,
  fetchDashboardCardData,
} from "metabase/dashboard/actions";
import { getDashboardActions } from "metabase/dashboard/components/DashboardActions";
import { DashboardGridConnected } from "metabase/dashboard/components/DashboardGrid";
import { DashboardTabs } from "metabase/dashboard/components/DashboardTabs";
import { DashboardControls } from "metabase/dashboard/hoc/DashboardControls";
import type {
  DashboardControlsPassedProps,
  DashboardControlsProps,
} from "metabase/dashboard/hoc/types";
import {
  getDashboardComplete,
  getDashcardDataMap,
  getSlowCards,
  getParameters,
  getParameterValues,
  getDraftParameterValues,
  getSelectedTabId,
} from "metabase/dashboard/selectors";
import type {
  FetchDashboardResult,
  SuccessfulFetchDashboardResult,
} from "metabase/dashboard/types";
import { isActionDashCard } from "metabase/dashboard/utils";
import title from "metabase/hoc/Title";
import { isWithinIframe } from "metabase/lib/dom";
import ParametersS from "metabase/parameters/components/ParameterValueWidget.module.css";
import { setErrorPage } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";
import {
  setPublicDashboardEndpoints,
  setEmbedDashboardEndpoints,
} from "metabase/services";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import type { Dashboard, DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import EmbedFrame from "../../components/EmbedFrame";

import { DashboardContainer } from "./PublicOrEmbeddedDashboard.styled";

const mapStateToProps = (state: State, props: OwnProps) => {
  return {
    // this MUST go here, so it's passed to DashboardControls in the _.compose at the bottom
    dashboardId: String(
      props.params.dashboardId || props.params.uuid || props.params.token,
    ),
    metadata: getMetadata(state),
    dashboard: getDashboardComplete(state),
    dashcardData: getDashcardDataMap(state),
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

  // these two must also go here, so it's passed to DashboardControls in the _.compose at the bottom
  fetchDashboard,
  fetchDashboardCardData,
};

const connector = connect(mapStateToProps, mapDispatchToProps);

type ReduxProps = ConnectedProps<typeof connector>;

type OwnProps = {
  params: {
    dashboardId?: DashboardId;
    uuid?: string;
    token?: string;
  };
} & DashboardControlsProps;

type PublicOrEmbeddedDashboardProps = ReduxProps &
  OwnProps &
  DashboardControlsPassedProps;

class PublicOrEmbeddedDashboardInner extends Component<PublicOrEmbeddedDashboardProps> {
  _initialize = async () => {
    const {
      initialize,
      fetchDashboard,
      fetchDashboardCardData,
      setErrorPage,
      location,
      params: { uuid, token },
    } = this.props;
    if (uuid) {
      setPublicDashboardEndpoints(uuid);
    } else if (token) {
      setEmbedDashboardEndpoints(token);
    }

    initialize();

    const result = await fetchDashboard({
      dashId: String(uuid || token),
      queryParams: location.query,
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

  getCurrentTabDashcards = () => {
    const { dashboard, selectedTabId } = this.props;
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

  getHiddenParameterSlugs = () => {
    const { parameters } = this.props;
    const currentTabParameterIds =
      this.getCurrentTabDashcards()?.flatMap(
        dashcard =>
          dashcard.parameter_mappings?.map(mapping => mapping.parameter_id) ??
          [],
      ) ?? [];
    const hiddenParameters = parameters.filter(
      parameter => !currentTabParameterIds.includes(parameter.id),
    );
    return hiddenParameters.map(parameter => parameter.slug).join(",");
  };

  render() {
    const {
      dashboard,
      parameters,
      parameterValues,
      draftParameterValues,
      isFullscreen,
      isNightMode,
      setParameterValueToDefault,
      onFullscreenChange,
      onNightModeChange,
      onRefreshPeriodChange,
      refreshPeriod,
      setRefreshElapsedHook,
      hasNightModeToggle,
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

    return (
      <EmbedFrame
        name={dashboard && dashboard.name}
        description={dashboard && dashboard.description}
        dashboard={dashboard}
        parameters={parameters}
        parameterValues={parameterValues}
        draftParameterValues={draftParameterValues}
        hiddenParameterSlugs={this.getHiddenParameterSlugs()}
        setParameterValue={this.props.setParameterValue}
        setParameterValueToDefault={setParameterValueToDefault}
        enableParameterRequiredBehavior
        actionButtons={
          buttons.length > 0 && <div className={CS.flex}>{buttons}</div>
        }
        dashboardTabs={
          dashboard?.tabs &&
          dashboard.tabs.length > 1 && (
            <DashboardTabs
              dashboardId={this.props.dashboardId}
              location={this.props.location}
            />
          )
        }
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
          {() =>
            dashboard ? (
              <DashboardContainer>
                <DashboardGridConnected
                  dashboard={assoc(dashboard, "dashcards", visibleDashcards)}
                  isPublicOrEmbedded
                  mode={PublicMode as unknown as Mode}
                  metadata={this.props.metadata}
                  navigateToNewCardFromDashboard={() => {}}
                  dashcardData={this.props.dashcardData}
                  selectedTabId={this.props.selectedTabId}
                  slowCards={this.props.slowCards}
                  isEditing={false}
                  isEditingParameter={false}
                  isXray={false}
                  isFullscreen={isFullscreen}
                  isNightMode={isNightMode}
                  clickBehaviorSidebarDashcard={null}
                  width={0}
                />
              </DashboardContainer>
            ) : null
          }
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

export const PublicOrEmbeddedDashboardControlled = _.compose(
  connector,
  title(
    ({ dashboard }: { dashboard: Dashboard }) => dashboard && dashboard.name,
  ),
  DashboardControls,
)(PublicOrEmbeddedDashboardInner) as ComponentType<OwnProps>;
