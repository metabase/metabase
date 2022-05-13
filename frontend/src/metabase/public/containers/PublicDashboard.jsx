/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import cx from "classnames";

import { IFRAMED } from "metabase/lib/dom";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import DashboardGrid from "metabase/dashboard/components/DashboardGrid";
import DashboardControls from "metabase/dashboard/hoc/DashboardControls";
import { getDashboardActions } from "metabase/dashboard/components/DashboardActions";
import EmbedFrame from "../components/EmbedFrame";
import title from "metabase/hoc/Title";

import { fetchDatabaseMetadata } from "metabase/redux/metadata";
import { setErrorPage } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";

import PublicMode from "metabase/modes/components/modes/PublicMode";

import {
  getDashboardComplete,
  getCardData,
  getSlowCards,
  getParameters,
  getParameterValues,
} from "metabase/dashboard/selectors";

import * as dashboardActions from "metabase/dashboard/actions";

import {
  setPublicDashboardEndpoints,
  setEmbedDashboardEndpoints,
} from "metabase/services";

import _ from "underscore";

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
  };
};

const mapDispatchToProps = {
  ...dashboardActions,
  fetchDatabaseMetadata,
  setErrorPage,
  onChangeLocation: push,
};

// NOTE: this should use DashboardData HoC
class PublicDashboard extends Component {
  async UNSAFE_componentWillMount() {
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
    try {
      await fetchDashboard(uuid || token, location.query);
      await fetchDashboardCardData({ reload: false, clear: true });
    } catch (error) {
      console.error(error);
      setErrorPage(error);
    }
  }

  componentWillUnmount() {
    this.props.cancelFetchDashboardCardData();
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (!_.isEqual(this.props.parameterValues, nextProps.parameterValues)) {
      this.props.fetchDashboardCardData({ reload: false, clear: true });
    }
  }

  render() {
    const {
      dashboard,
      parameters,
      parameterValues,
      isFullscreen,
      isNightMode,
    } = this.props;
    const buttons = !IFRAMED
      ? getDashboardActions(this, { ...this.props, isPublic: true })
      : [];

    return (
      <EmbedFrame
        name={dashboard && dashboard.name}
        description={dashboard && dashboard.description}
        dashboard={dashboard}
        parameters={parameters}
        parameterValues={parameterValues}
        setParameterValue={this.props.setParameterValue}
        actionButtons={
          buttons.length > 0 && <div className="flex">{buttons}</div>
        }
      >
        <LoadingAndErrorWrapper
          className={cx("Dashboard p1 flex-full", {
            "Dashboard--fullscreen": isFullscreen,
            "Dashboard--night": isNightMode,
          })}
          loading={!dashboard}
        >
          {() => (
            <DashboardGrid
              {...this.props}
              className={"spread"}
              mode={PublicMode}
              metadata={this.props.metadata}
              navigateToNewCardFromDashboard={() => {}}
            />
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
