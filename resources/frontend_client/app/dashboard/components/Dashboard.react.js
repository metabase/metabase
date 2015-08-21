"use strict";
/*global _*/

import React, { Component, PropTypes } from "react";

import LoadingSpinner from "metabase/components/LoadingSpinner.react";
import DashboardHeader from "../components/DashboardHeader.react";
import DashboardGrid from "../components/DashboardGrid.react";

import { fetchDashboard } from "../actions";

export default class Dashboard extends Component {

    constructor() {
        super();
        this.state = { error: null };
    }

    async componentDidMount() {
        try {
            await this.props.dispatch(fetchDashboard(this.props.selectedDashboard));
        } catch (error) {
            if (error.status === 404) {
                this.props.onChangeLocation("/404");
            } else {
                this.setState({ error });
            }
        }
    }

    render() {
        let { dashboard } = this.props;
        let { error } = this.state;
        return (
            <div className="Dashboard full-height flex flex-row flex-full">
                { !error && !dashboard ?
                    <div className="text-centered my4 py4">
                        <div className="Dash-wrapper wrapper">
                            <div className="my4 py4 text-brand">
                                <LoadingSpinner />
                                <h1 className="text-normal text-grey-2">Loading...</h1>
                            </div>
                        </div>
                    </div>
                : null }

                { error ?
                    <div className="Dash-wrapper wrapper">
                        <div className="full-height text-centered flex layout-centered">
                            <h2 className="text-error text-grey-1">{error.data}</h2>
                        </div>
                    </div>
                : null }

                { dashboard && !error ?
                    <div className="full">
                        <DashboardHeader {...this.props} />
                        <div className="Dash-wrapper wrapper full-height">
                            { dashboard.ordered_cards.length === 0 ?
                                <div className="flex flex-column layout-centered">
                                    <span className="QuestionCircle">?</span>
                                    <p className="text-normal">This dashboard is looking empty.</p>
                                    <p className="text-normal text-grey-2">Add a question to start making it useful!</p>
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

Dashboard.propTypes = {
    dispatch: PropTypes.func.isRequired,
    onChangeLocation: PropTypes.func.isRequired,
    onDashboardDeleted: PropTypes.func.isRequired,
    visualizationSettingsApi: PropTypes.object.isRequired
};
