import { Component, type ComponentType } from "react";
import type { ConnectedProps } from "react-redux";
import type { WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import _ from "underscore";

import * as dashboardActions from "metabase/dashboard/actions";
import {
  getDashboardComplete,
  getDashcardDataMap,
  getIsNavigatingBackToDashboard,
  getParameterValues,
  getParameters,
  getSelectedTabId,
  getSlowCards,
} from "metabase/dashboard/selectors";
import { connect } from "metabase/lib/redux";
import { setErrorPage } from "metabase/redux/app";
import type { DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type {
  FailedFetchDashboardResult,
  FetchDashboardResult,
} from "../types";

const mapStateToProps = (state: State) => {
  return {
    dashboard: getDashboardComplete(state),
    dashcardData: getDashcardDataMap(state),
    selectedTabId: getSelectedTabId(state),
    slowCards: getSlowCards(state),
    parameters: getParameters(state),
    parameterValues: getParameterValues(state),
    isNavigatingBackToDashboard: getIsNavigatingBackToDashboard(state),
  };
};

const mapDispatchToProps = {
  ...dashboardActions,
  setErrorPage,
  onChangeLocation: push,
};

const connector = connect(mapStateToProps, mapDispatchToProps);

type ReduxProps = ConnectedProps<typeof connector>;

export type DashboardDataProps = {
  dashboardId: DashboardId;
  noLink: boolean;
} & WithRouterProps;

export type DashboardDataReturnedProps = DashboardDataProps &
  Omit<ReduxProps, "navigateToNewCardFromDashboard"> & {
    navigateToNewCardFromDashboard:
      | ReduxProps["navigateToNewCardFromDashboard"]
      | null;
  };

/**
 * @deprecated HOCs are deprecated
 */
export const DashboardData = (
  ComposedComponent: ComponentType<DashboardDataReturnedProps>,
) =>
  connector(
    class DashboardDataInner extends Component<DashboardDataReturnedProps> {
      async load(props: DashboardDataReturnedProps) {
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

        if (isFailedFetchDashboardResult(result)) {
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

      UNSAFE_componentWillReceiveProps(nextProps: DashboardDataReturnedProps) {
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

function isFailedFetchDashboardResult(
  result: FetchDashboardResult,
): result is FailedFetchDashboardResult {
  const hasError = "error" in result;
  return hasError;
}
