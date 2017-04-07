/* @flow */

import React, {Component, PropTypes} from 'react';
import {connect} from "react-redux";
import _ from 'underscore';

import type {Dashboard} from "metabase/meta/types/Dashboard";

import WhatsADashboard from "../components/WhatsADashboard";
import DashboardList from "../components/DashboardList";

import TitleAndDescription from "metabase/components/TitleAndDescription";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import Modal from "metabase/components/Modal.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Icon from "metabase/components/Icon.jsx";

import * as dashboardsActions from "../dashboards";
import {getDashboardListing} from "../selectors";
import SearchHeader from "../../components/SearchHeader";

const mapStateToProps = (state, props) => ({
    dashboards: getDashboardListing(state)
});

const mapDispatchToProps = dashboardsActions;

@connect(mapStateToProps, mapDispatchToProps)
export default class Dashboards extends Component {
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
                name.includes(searchText) || (description && description.includes(searchText))
            );
        }
    }

    render() {
        let {modalOpen} = this.state;

        const isLoading = this.props.dashboards == null
        const noDashboardsCreated = this.props.dashboards && this.props.dashboards.length === 0
        const filteredDashboards = isLoading ? [] : this.getFilteredDashboards();

        // FIXME Remove these development flags prior to reviews and merge
        // const noDashboardsCreated = true;

        return (
            <LoadingAndErrorWrapper loading={isLoading} className="relative mx4">
                { modalOpen ? this.renderCreateDashboardModal() : null }
                <div className="flex align-center pt4 pb1">
                    <TitleAndDescription title="Dashboards"/>
                    <Icon name="add"
                          className="flex-align-right px4 cursor-pointer text-grey-5 text-brand-hover"
                          size={20}
                          onClick={this.showCreateDashboard}/>
                </div>
                <div className="flex align-center pb1">
                    <SearchHeader
                        searchText={this.state.searchText}
                        setSearchText={(searchText) => this.setState({searchText})}
                    />
                </div>
                { noDashboardsCreated ?
                    <WhatsADashboard button={
                        <a onClick={this.showCreateDashboard} className="Button Button--primary">Create a dashboard</a>
                    }/>
                    : <DashboardList dashboards={filteredDashboards}/>
                }
            </LoadingAndErrorWrapper>
        );
    }
}
