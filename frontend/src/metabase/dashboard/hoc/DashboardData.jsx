/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";

import * as dashboardActions from "metabase/dashboard/actions";
import {
  getDashboardComplete,
  getDashcardDataMap,
  getSlowCards,
  getParameters,
  getParameterValues,
  getIsNavigatingBackToDashboard,
  getSelectedTabId,
} from "metabase/dashboard/selectors";
import { setErrorPage } from "metabase/redux/app";

const mapStateToProps = (state, props) => {
  return {
    dashboard: getDashboardComplete(state, props),
    dashcardData: getDashcardDataMap(state, props),
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

        const result = await fetchDashboard({
          dashId: dashboardId,
          queryParams: location && location.query,
          options: {
            clearCache: !isNavigatingBackToDashboard,
          },
        });

        if (result.error) {
          setErrorPage(result.payload);
          return;
        }

        try {
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
          return;
        }

        // First time componentWillReceiveProps is called,
        // parameterValues are an empty object, and nextProps.parameterValues have all value set to null
        // DashboardsData is only used for x-rays, and we should better switch them to the same logic as other dashboards
        if (
          !_.isEmpty(this.props.parameterValues) &&
          !_.isEqual(this.props.parameterValues, nextProps.parameterValues)
        ) {
          this.props.fetchDashboardCardData({
            reload: false,
            clearCache: true,
          });
          return;
        }

        if (!_.isEqual(nextProps.selectedTabId, this.props.selectedTabId)) {
          this.props.fetchDashboardCardData();
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
