/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import cx from "classnames";

import _ from "underscore";
import { isWithinIframe } from "metabase/lib/dom";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { DashboardGridConnected } from "metabase/dashboard/components/DashboardGrid";
import { DashboardControls } from "metabase/dashboard/hoc/DashboardControls";
import { getDashboardActions } from "metabase/dashboard/components/DashboardActions";
import title from "metabase/hoc/Title";

import { setErrorPage } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";

import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";

import {
  getDashboardComplete,
  getCardData,
  getSlowCards,
  getParameters,
  getParameterValues,
  getDraftParameterValues,
  getSelectedTabId,
} from "metabase/dashboard/selectors";

import * as dashboardActions from "metabase/dashboard/actions";
import { DashboardTabs } from "metabase/dashboard/components/DashboardTabs";

import {
  setPublicDashboardEndpoints,
  setEmbedDashboardEndpoints,
} from "metabase/services";
import EmbedFrame from "../components/EmbedFrame";

import { DashboardContainer } from "./PublicDashboard.styled";

const mapStateToProps = (state, props) => {
  return {
    metadata: getMetadata(state, props),
    dashboardId:
      props.params.dashboardId || props.params.uuid || props.params.token,
    dashboard: getDashboardComplete(state, props),
    dashcardData: getCardData(state, props),
    slowCards: getSlowCards(state, props),
    parameters: getParameters(state, props),
    parameterValues: getParameterValues(state, props),
    draftParameterValues: getDraftParameterValues(state, props),
    selectedTabId: getSelectedTabId(state),
  };
};

const mapDispatchToProps = {
  ...dashboardActions,
  setErrorPage,
  onChangeLocation: push,
};

class PublicDashboard extends Component {
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
      setPublicDashboardEndpoints();
    } else if (token) {
      setEmbedDashboardEndpoints();
    }

    initialize();

    const result = await fetchDashboard({
      dashId: uuid || token,
      queryParams: location.query,
    });

    if (result.error) {
      setErrorPage(result.payload);
      return;
    }

    try {
      if (this.props.dashboard.tabs.length === 0) {
        await fetchDashboardCardData({ reload: false, clearCache: true });
      }
    } catch (error) {
      console.error(error);
      setErrorPage(error);
    }
  };

  async componentDidMount() {
    this._initialize();
  }

  componentWillUnmount() {
    this.props.cancelFetchDashboardCardData();
  }

  async componentDidUpdate(prevProps) {
    if (this.props.dashboardId !== prevProps.dashboardId) {
      return this._initialize();
    }

    if (!_.isEqual(prevProps.selectedTabId, this.props.selectedTabId)) {
      this.props.fetchDashboardCardData();
      this.props.fetchDashboardCardMetadata();
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
      return dashboard.dashcards;
    }
    return dashboard.dashcards.filter(
      dashcard => dashcard.dashboard_tab_id === selectedTabId,
    );
  };

  getHiddenParameterSlugs = () => {
    const { parameters } = this.props;
    const currentTabParameterIds = this.getCurrentTabDashcards().flatMap(
      dashcard =>
        dashcard.parameter_mappings?.map(mapping => mapping.parameter_id) ?? [],
    );
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
    } = this.props;

    const buttons = !isWithinIframe()
      ? getDashboardActions(this, { ...this.props, isPublic: true })
      : [];

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
          buttons.length > 0 && <div className="flex">{buttons}</div>
        }
        dashboardTabs={<DashboardTabs location={this.props.location} />}
      >
        <LoadingAndErrorWrapper
          className={cx({
            "Dashboard--fullscreen": isFullscreen,
            "Dashboard--night": isNightMode,
          })}
          loading={!dashboard}
        >
          {() => (
            <DashboardContainer>
              <DashboardGridConnected
                {...this.props}
                isPublic
                className="spread"
                mode={PublicMode}
                metadata={this.props.metadata}
                navigateToNewCardFromDashboard={() => {}}
              />
            </DashboardContainer>
          )}
        </LoadingAndErrorWrapper>
      </EmbedFrame>
    );
  }
}

export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  title(({ dashboard }) => dashboard && dashboard.name),
  DashboardControls,
)(PublicDashboard);
