/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import { IFRAMED } from "metabase/lib/dom";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import DashboardGrid from "metabase/dashboard/components/DashboardGrid";
import DashboardControls from "metabase/dashboard/hoc/DashboardControls";
import { getDashboardActions } from "metabase/dashboard/components/DashboardActions";
import EmbedFrame from "../components/EmbedFrame";

import { fetchDatabaseMetadata } from "metabase/redux/metadata";
import { setErrorPage } from "metabase/redux/app";

import { getDashboardComplete, getCardData, getCardDurations,getParameterValues } from "metabase/dashboard/selectors";

import * as dashboardActions from "metabase/dashboard/dashboard";

import type { Dashboard } from "metabase/meta/types/Dashboard";

import _ from "underscore";

const mapStateToProps = (state, props) => {
  return {
      dashboardId:          props.params.dashboardId || props.params.uuid || props.params.token,
      dashboard:            getDashboardComplete(state, props),
      dashcardData:         getCardData(state, props),
      cardDurations:        getCardDurations(state, props),
      parameterValues:      getParameterValues(state, props)
  }
}

const mapDispatchToProps = {
    ...dashboardActions,
    fetchDatabaseMetadata,
    setErrorPage,
    onChangeLocation: push
}

type Props = {
    params:                 { uuid?: string, token?: string },
    location:               { query: { [key:string]: string }},
    dashboardId:            string,

    dashboard?:             Dashboard,
    parameterValues:        {[key:string]: string},

    initialize:             () => void,
    fetchDashboard:         (dashId: string, query: { [key:string]: string }) => Promise<void>,
    fetchDashboardCardData: (options: { reload: bool, clear: bool }) => Promise<void>,
    setParameterValue:      (id: string, value: string) => void,
    setErrorPage:           (error: { status: number }) => void,
};

@connect(mapStateToProps, mapDispatchToProps)
@DashboardControls
export default class PublicDashboard extends Component<*, Props, *> {
    // $FlowFixMe
    async componentWillMount() {
        const { initialize, fetchDashboard, fetchDashboardCardData, setErrorPage, location, params: { uuid, token }}  = this.props;
        initialize();
        try {
            // $FlowFixMe
            await fetchDashboard(uuid || token, location.query);
            await fetchDashboardCardData({ reload: false, clear: true });
        } catch (error) {
            setErrorPage(error);
        }
    }

    componentWillReceiveProps(nextProps: Props) {
        if (!_.isEqual(this.props.parameterValues, nextProps.parameterValues)) {
            this.props.fetchDashboardCardData({ reload: false, clear: true });
        }
    }

    render() {
        const { dashboard, parameterValues } = this.props;
        const buttons = !IFRAMED ? getDashboardActions(this.props) : [];

        return (
            <EmbedFrame
                name={dashboard && dashboard.name}
                description={dashboard && dashboard.description}
                parameters={dashboard && dashboard.parameters}
                parameterValues={parameterValues}
                setParameterValue={this.props.setParameterValue}
                actionButtons={buttons.length > 0 &&
                    <div>
                        {buttons.map((button, index) =>
                            <span key={index} className="m1">{button}</span>
                        )}
                    </div>
                }
            >
                <LoadingAndErrorWrapper className="p1 flex-full" loading={!dashboard}>
                { () =>
                    <DashboardGrid
                        {...this.props}
                        className={"spread"}
                        linkToCard={false}
                    />
                }
                </LoadingAndErrorWrapper>
            </EmbedFrame>
        );
    }
}
