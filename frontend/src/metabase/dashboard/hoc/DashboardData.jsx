import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import { fetchDatabaseMetadata } from "metabase/redux/metadata";
import { setErrorPage } from "metabase/redux/app";

import {
  getDashboardComplete,
  getCardData,
  getSlowCards,
  getParameters,
  getParameterValues,
} from "metabase/dashboard/selectors";

import * as dashboardActions from "metabase/dashboard/actions";

import type { Dashboard } from "metabase-types/types/Dashboard";
import type { Parameter } from "metabase-types/types/Parameter";

import _ from "underscore";

const mapStateToProps = (state, props) => {
  return {
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

type Props = {
  location?: { query: { [key: string]: string } },
  dashboardId: string,

  dashboard?: Dashboard,
  parameters: Parameter[],
  parameterValues: { [key: string]: string },

  reset: () => void,
  isFullscreen: boolean,
  isNightMode: boolean,
  intializeDashboard: (
    dashId: string,
    query?: { [key: string]: string },
  ) => Promise<void>,
  fetchDashboardCardData: (options: {
    reload: boolean,
    clear: boolean,
  }) => Promise<void>,
  cancelFetchDashboardCardData: () => Promise<void>,
  setParameterValue: (id: string, value: string) => void,
  setErrorPage: (error: { status: number }) => void,

  navigateToNewCardFromDashboard: (args: any) => void,

  // don't link card titles to the query builder
  noLink: boolean,
};

export default (ComposedComponent: React.Class) =>
  connect(
    mapStateToProps,
    mapDispatchToProps,
  )(
    class DashboardContainer extends Component {
      props: Props;

      async load(props) {
        const {
          reset,
          intializeDashboard,
          fetchDashboardCardData,
          setErrorPage,
          location,
          dashboardId,
        } = props;

        this.setState({ isLoading: true });

        reset();
        try {
          await intializeDashboard(dashboardId, location && location.query);
          await fetchDashboardCardData({ reload: false, clear: true });
        } catch (error) {
          console.error(error);
          setErrorPage(error);
        }

        this.setState({ isLoading: false });
      }

      componentDidMount() {
        this.load(this.props);
      }

      componentWillUnmount() {
        this.props.cancelFetchDashboardCardData();
      }

      componentDidUpdate(prevProps) {
        if (this.state.isLoading) {
          return;
        }

        if (prevProps.dashboardId !== this.props.dashboardId) {
          this.load(this.props);
        } else if (
          !_.isEqual(prevProps.parameterValues, this.props.parameterValues)
        ) {
          this.props.fetchDashboardCardData({ reload: false, clear: true });
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
