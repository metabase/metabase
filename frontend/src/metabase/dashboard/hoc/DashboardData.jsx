/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import _ from "underscore";
import { setErrorPage } from "metabase/redux/app";

import {
  getDashboardComplete,
  getCardData,
  getSlowCards,
  getParameters,
  getParameterValues,
  getIsNavigatingBackToDashboard,
  getSelectedTabId,
} from "metabase/dashboard/selectors";

import * as dashboardActions from "metabase/dashboard/actions";

const mapStateToProps = (state, props) => {
  return {
    dashboard: getDashboardComplete(state, props),
    dashcardData: getCardData(state, props),
    selectedTabId: getSelectedTabId(state),
    slowCards: getSlowCards(state, props),
    parameters: getParameters(state, props),
    parameterValues: getParameterValues(state, props),
    isNavigatingBackToDashboard: getIsNavigatingBackToDashboard(state),
  };
};

const mapDispatchToProps = {
  ...dashboardActions,
  setErrorPage,
  onChangeLocation: push,
};

/**
 * @deprecated HOCs are deprecated
 */
export const DashboardData = ComposedComponent =>
  connect(
    mapStateToProps,
    mapDispatchToProps,
  )(
    class DashboardDataInner extends Component {
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

        initialize({ clearCache: !isNavigatingBackToDashboard });

        try {
          await fetchDashboard(dashboardId, location && location.query, {
            clearCache: !isNavigatingBackToDashboard,
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
        } else if (
          !_.isEqual(nextProps.selectedTabId, this.props.selectedTabId)
        ) {
          this.props.fetchDashboardCardData();
          this.props.fetchDashboardCardMetadata();
          return;
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
