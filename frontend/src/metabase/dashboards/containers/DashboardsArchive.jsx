/* @flow */

import React, {Component} from 'react';
import {connect} from "react-redux";
import cx from "classnames";
import _ from "underscore"

import type {Dashboard} from "metabase/meta/types/Dashboard";

import DashboardList from "../components/DashboardList";

import HeaderWithBack from "../../components/HeaderWithBack";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import SearchHeader from "metabase/components/SearchHeader";
import EmptyState from "metabase/components/EmptyState";
import type {ListFilterWidgetItem} from "metabase/components/ListFilterWidget";

import {caseInsensitiveSearch} from "metabase/lib/string"

import type {SetArchivedAction} from "../dashboards";
import {fetchArchivedDashboards, setArchived} from "../dashboards";
import {getArchivedDashboards} from "../selectors";

const mapStateToProps = (state, props) => ({
    dashboards: getArchivedDashboards(state)
});

const mapDispatchToProps = {fetchArchivedDashboards, setArchived};

export class Dashboards extends Component {
    props: {
        dashboards: Dashboard[],
        fetchArchivedDashboards: () => void,
        setArchived: SetArchivedAction
    };

    state = {
        searchText: "",
    }
    componentWillMount() {
        this.props.fetchArchivedDashboards();
    }

    searchTextFilter = (searchText: string) =>
        ({name, description}: Dashboard) =>
            (caseInsensitiveSearch(name, searchText) || (description && caseInsensitiveSearch(description, searchText)))

    getFilteredDashboards = () => {
        const {searchText} = this.state;
        const {dashboards} = this.props;
        const noOpFilter = _.constant(true)

        return _.chain(dashboards)
            .filter(searchText != "" ? this.searchTextFilter(searchText) : noOpFilter)
            .value()
    }

    updateSection = (section: ListFilterWidgetItem) => {
        this.setState({section});
    }

    render() {
        let {searchText} = this.state;

        const isLoading = this.props.dashboards === null
        const noDashboardsArchived = this.props.dashboards && this.props.dashboards.length === 0
        const filteredDashboards = isLoading ? [] : this.getFilteredDashboards();
        const noSearchResults = searchText !== "" && filteredDashboards.length === 0;

        return (
            <LoadingAndErrorWrapper
                loading={isLoading}
                className={cx("relative mx4", {"flex-full flex align-center justify-center": noDashboardsArchived})}
            >
                { noDashboardsArchived ?
                    <div className="mt2">
                        <EmptyState
                            message={<span>You haven't archived any dashboards yet.</span>}
                            image="/app/img/dashboard_illustration"
                            action="Create a dashboard"
                            onActionClick={this.showCreateDashboard}
                            className="mt2"
                            imageClassName="mln2"
                        />
                    </div>
                    : <div>
                        <div className="flex align-center pt4 pb1">
                                <HeaderWithBack name="Archive" />
                        </div>
                        <div className="flex align-center pb1">
                            <SearchHeader
                                searchText={searchText}
                                setSearchText={(text) => this.setState({searchText: text})}
                            />
                        </div>
                        { noSearchResults ?
                            <div className="flex justify-center">
                                <EmptyState
                                    message={
                                        <div className="mt4">
                                            <h3 className="text-grey-5">No results found</h3>
                                            <p className="text-grey-4">Try adjusting your filter to find what you’re
                                                looking for.</p>
                                        </div>
                                    }
                                    image="/app/img/empty_dashboard"
                                    action="Create a dashboard"
                                    imageClassName="mln2"
                                    smallDescription
                                />
                            </div>
                            : <DashboardList dashboards={filteredDashboards}
                                             setArchived={this.props.setArchived}
                                             disableLinks />
                        }
                    </div>

                }
            </LoadingAndErrorWrapper>
        );
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(Dashboards)
