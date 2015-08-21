"use strict";
/*global _*/

import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';

import LoadingSpinner from "metabase/components/LoadingSpinner.react";
import DashboardHeader from "../components/DashboardHeader.react";
import DashboardGrid from "../components/DashboardGrid.react";

import { fetchDashboard } from "../actions";
import { dashboardSelectors } from "../selectors";

@connect(dashboardSelectors)
export default class DashboardApp extends React.Component {

    componentDidMount() {
        this.props.dispatch(fetchDashboard(this.props.selectedDashboard));
    }

    render() {
        var { dashboard, dashboardLoadError } = this.props;
        return (
            <div className="Dashboard full-height flex flex-row flex-full">
                { !dashboardLoadError && !dashboard ?
                    <div className="text-centered my4 py4">
                        <div className="Dash-wrapper wrapper">
                            <div className="my4 py4 text-brand">
                                <LoadingSpinner />
                                <h1 className="text-normal text-grey-2">Loading...</h1>
                            </div>
                        </div>
                    </div>
                : null }

                { dashboardLoadError ?
                    <div className="Dash-wrapper wrapper">
                        <div className="full-height text-centered flex layout-centered">
                            <h2 className="text-error text-grey-1">{dashboardLoadError}</h2>
                        </div>
                    </div>
                : null }

                { dashboard ?
                    <div className="full" ng-if="dashboardLoaded && !dashboardLoadError">
                        <DashboardHeader {...this.props} />
                        <div className="Dash-wrapper wrapper full-height">
                            { dashboard.ordered_cards.length === 0 ?
                                <div>
                                    <h1 className="text-normal text-grey-2">This dashboard doesn't have any data yet.</h1>
                                    <a className="Button Button--primary" href="/q">Ask a question</a>
                                </div>
                            :
                                <DashboardGrid {...this.props} />
                            }
                        </div>
                    </div>
                : null }
            </div>
        );
    }
}

DashboardApp.propTypes = {
};

// export default connect(select)(DashboardApp);
