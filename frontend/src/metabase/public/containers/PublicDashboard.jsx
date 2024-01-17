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

import {
  setPublicDashboardEndpoints,
  setEmbedDashboardEndpoints,
} from "metabase/services";
import { DashboardTabs } from "metabase/dashboard/components/DashboardTabs";
import EmbedFrame from "../components/EmbedFrame";

import {
  DashboardContainer,
  DashboardGridContainer,
  Separator,
} from "./PublicDashboard.styled";

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

// NOTE: this should use DashboardData HoC
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

  render() {
    const {
      dashboard,
      parameters,
      parameterValues,
      draftParameterValues,
      isFullscreen,
      isNightMode,
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
        setParameterValue={this.props.setParameterValue}
        actionButtons={
          buttons.length > 0 && <div className="flex">{buttons}</div>
        }
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
              <DashboardTabs location={this.props.location} />
              <Separator />
              <DashboardGridContainer>
                <DashboardGridConnected
                  {...this.props}
                  isPublic
                  className="spread"
                  mode={PublicMode}
                  metadata={this.props.metadata}
                  navigateToNewCardFromDashboard={() => {}}
                />
              </DashboardGridContainer>
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
