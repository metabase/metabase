/* @flow */

import React, {Component} from 'react';
import {connect} from "react-redux";
import cx from "classnames";
import _ from "underscore"

import type {Dashboard} from "metabase/meta/types/Dashboard";

import HeaderWithBack from "../../components/HeaderWithBack";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import SearchHeader from "metabase/components/SearchHeader";
import EmptyState from "metabase/components/EmptyState";
import ArchivedItem from "metabase/components/ArchivedItem";

import {caseInsensitiveSearch} from "metabase/lib/string"

import type {SetArchivedAction} from "../dashboards";
import {fetchArchivedDashboards, setArchived} from "../dashboards";
import {getArchivedDashboards} from "../selectors";
import {getUserIsAdmin} from "metabase/selectors/user";

const mapStateToProps = (state, props) => ({
    dashboards: getArchivedDashboards(state),
    isAdmin: getUserIsAdmin(state, props)
});

const mapDispatchToProps = {fetchArchivedDashboards, setArchived};

export class Dashboards extends Component {
    props: {
        dashboards: Dashboard[],
        fetchArchivedDashboards: () => void,
        setArchived: SetArchivedAction,
        isAdmin: boolean
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
            .sortBy((dash) => dash.name.toLowerCase())
            .value()
            .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    }

    render() {
        let {searchText} = this.state;

        const isLoading = this.props.dashboards === null
        const noDashboardsArchived = this.props.dashboards && this.props.dashboards.length === 0
        const filteredDashboards = isLoading ? [] : this.getFilteredDashboards();
        const noSearchResults = searchText !== "" && filteredDashboards.length === 0;

        const headerWithBackContainer =
            <div className="flex align-center pt4 pb1">
                <HeaderWithBack name="Archive"/>
            </div>

        return (
            <LoadingAndErrorWrapper
                loading={isLoading}
                className={cx("relative mx4", {"flex-full ": noDashboardsArchived})}
            >
                { noDashboardsArchived ?
                    <div>
                        {headerWithBackContainer}
                        <div className="full flex justify-center" style={{marginTop: "75px"}}>
                            <EmptyState
                                message={<span>No dashboards have been<br />archived yet</span>}
                                icon="viewArchive"
                            />
                        </div>
                    </div>
                    : <div>
                        {headerWithBackContainer}
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
                                    imageClassName="mln2"
                                    smallDescription
                                />
                            </div>
                            : <div>
                                { filteredDashboards.map((dashboard) =>
                                    <ArchivedItem key={dashboard.id} name={dashboard.name} type="dashboard"
                                                  icon="dashboard"
                                                  isAdmin={true} onUnarchive={async () => {
                                        await this.props.setArchived(dashboard.id, false);
                                    }}/>
                                )}
                            </div>
                        }
                    </div>
                }
            </LoadingAndErrorWrapper>
        );
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(Dashboards)
