/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import _ from "underscore";
import { fetchDatabaseMetadata } from "metabase/redux/metadata";
import { setErrorPage } from "metabase/redux/app";

import {
  getDashboardComplete,
  getCardData,
  getSlowCards,
  getParameters,
  getParameterValues,
  getisNavigatingBackToDashboard,
} from "metabase/dashboard/selectors";

import * as dashboardActions from "metabase/dashboard/actions";

const mapStateToProps = (state, props) => {
  return {
    dashboard: getDashboardComplete(state, props),
    dashcardData: getCardData(state, props),
    slowCards: getSlowCards(state, props),
    parameters: getParameters(state, props),
    parameterValues: getParameterValues(state, props),
    isNavigatingBackToDashboard: getisNavigatingBackToDashboard(state),
  };
};

const mapDispatchToProps = {
  ...dashboardActions,
  fetchDatabaseMetadata,
  setErrorPage,
  onChangeLocation: push,
};

export default ComposedComponent =>
  connect(
    mapStateToProps,
    mapDispatchToProps,
  )(
    class DashboardContainer extends Component {
      async load(props) {
        const {
          initialize,
          fetchDashboard,
          fetchDashboardCardData,
          setErrorPage,
          location,
          dashboardId,
          isNavigatingBackToDashboard,
        } = props;

        initialize({ clear: !isNavigatingBackToDashboard });

        try {
          await fetchDashboard(dashboardId, location && location.query, {
            preserveDashboard: isNavigatingBackToDashboard,
          });
          await fetchDashboardCardData({
            reload: false,
            clearCache: !isNavigatingBackToDashboard,
          });
        } catch (error) {
          console.error(error);
          setErrorPage(error);
        }
      }

      UNSAFE_componentWillMount() {
        this.load(this.props);
      }

      componentWillUnmount() {
        this.props.cancelFetchDashboardCardData();
      }

      UNSAFE_componentWillReceiveProps(nextProps) {
        if (nextProps.dashboardId !== this.props.dashboardId) {
          this.load(nextProps);
        } else if (
          !_.isEqual(this.props.parameterValues, nextProps.parameterValues)
        ) {
          this.props.fetchDashboardCardData({
            reload: false,
            clearCache: true,
          });
        }
      }

      render() {
        const { navigateToNewCardFromDashboard, ...props } = this.props;
        return (
          <ComposedComponent
            {...props}
            // if noLink is provided, don't include navigateToNewCardFromDashboard
            navigateToNewCardFromDashboard={
              this.props.noLink ? null : navigateToNewCardFromDashboard
            }
          />
        );
      }
    },
  );
