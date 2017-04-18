/* @flow */

import React, {Component, PropTypes} from 'react';
import {connect} from "react-redux";
import cx from "classnames";

import type {Dashboard} from "metabase/meta/types/Dashboard";

import DashboardList from "../components/DashboardList";

import TitleAndDescription from "metabase/components/TitleAndDescription";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import Modal from "metabase/components/Modal.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Icon from "metabase/components/Icon.jsx";
import SearchHeader from "metabase/components/SearchHeader";
import EmptyState from "metabase/components/EmptyState";

import {caseInsensitiveSearch} from "metabase/lib/string"

import * as dashboardsActions from "../dashboards";
import {getDashboardListing} from "../selectors";


const mapStateToProps = (state, props) => ({
    dashboards: getDashboardListing(state)
});

const mapDispatchToProps = dashboardsActions;

export class Dashboards extends Component {
    props: {
        dashboards: Dashboard[],
        createDashboard: (Dashboard) => any,
        fetchDashboards: PropTypes.func.isRequired,
    };

    state = {
        modalOpen: false,
        searchText: ""
    }

    componentWillMount() {
        this.props.fetchDashboards();
    }

    async onCreateDashboard(newDashboard: Dashboard) {
        let {createDashboard} = this.props;

        try {
            await createDashboard(newDashboard, {redirect: true});
        } catch (e) {
            console.log("createDashboard failed", e);
        }
    }

    showCreateDashboard = () => {
        this.setState({modalOpen: !this.state.modalOpen});
    }

    hideCreateDashboard = () => {
        this.setState({modalOpen: false});
    }

    renderCreateDashboardModal() {
        return (
            <Modal>
                <CreateDashboardModal
                    createDashboardFn={this.onCreateDashboard.bind(this)}
                    onClose={this.hideCreateDashboard}/>
            </Modal>
        );
    }

    getFilteredDashboards = () => {
        const {searchText} = this.state;
        const {dashboards} = this.props;

        if (searchText === "") {
            return dashboards;
        } else {
            return dashboards.filter(({name, description}) =>
                caseInsensitiveSearch(name,searchText) || (description && caseInsensitiveSearch(description, searchText))
            );
        }
    }

    render() {
        let {modalOpen, searchText} = this.state;

        const isLoading = this.props.dashboards === null
        const noDashboardsCreated = this.props.dashboards && this.props.dashboards.length === 0
        const filteredDashboards = isLoading ? [] : this.getFilteredDashboards();
        const noSearchResults = searchText !== "" && filteredDashboards.length === 0;

        return (
            <LoadingAndErrorWrapper
                loading={isLoading}
                className={cx("relative mx4", {"flex-full flex align-center justify-center": noDashboardsCreated})}
            >
                { modalOpen ? this.renderCreateDashboardModal() : null }
                { noDashboardsCreated ?
                    <div className="mt2">
                        <EmptyState
                            message={<span>Put the charts and graphs you look at <br/>frequently in a single, handy place.</span>}
                            image="/app/img/dashboard_illustration"
                            action="Create a dashboard"
                            onActionClick={this.showCreateDashboard}
                            className="mt2"
                            imageClassName="mln2"
                        />
                    </div>
                    : <div>
                        <div className="flex align-center pt4 pb1">
                            <TitleAndDescription title="Dashboards"/>
                            <div className="flex-align-right cursor-pointer text-grey-5 text-brand-hover">
                                <Icon name="add"
                                      size={20}
                                      onClick={this.showCreateDashboard}/>
                            </div>
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
                            : <DashboardList dashboards={filteredDashboards}/>
                        }
                    </div>

                }
            </LoadingAndErrorWrapper>
        );
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(Dashboards)
