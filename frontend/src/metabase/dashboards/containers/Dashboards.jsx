/* @flow */

import React, {Component, PropTypes} from 'react';
import {connect} from "react-redux";

import type { Dashboard } from "metabase/meta/types/Dashboard";

import WhatsADashboard from "../components/WhatsADashboard";
import DashboardList from "../components/DashboardList";

import TitleAndDescription from "metabase/components/TitleAndDescription";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import Modal from "metabase/components/Modal.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Icon from "metabase/components/Icon.jsx";

import * as dashboardsActions from "../dashboards";
import {getDashboards} from "../selectors";
import SearchHeader from "../../components/SearchHeader";

const mapStateToProps = (state, props) => ({
    dashboards: getDashboards(state)
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
            await createDashboard(newDashboard, { redirect: true });
        } catch (e) {
            console.log("createDashboard failed", e);
        }
    }

    toggleModal = () => {
        if (!this.state.modalOpen) {
            // when we open our modal we always close the dropdown
            this.setState({ modalOpen: !this.state.modalOpen });
        }
    }

    closeModal = () => {
        this.setState({modalOpen: false});
    }

    renderCreateDashboardModal() {
        return (
            <Modal>
                <CreateDashboardModal
                    createDashboardFn={this.onCreateDashboard.bind(this)}
                    onClose={this.closeModal}/>
            </Modal>
        );
    }

    render() {
        let {dashboards} = this.props;
        let {modalOpen, searchText} = this.state;

        // FIXME Remove these development flags prior to reviews and merge
        const simulateEmpty = false;
        if (simulateEmpty) dashboards = [];

        return (
            <LoadingAndErrorWrapper loading={!dashboards} className="relative mx4">
                { modalOpen ? this.renderCreateDashboardModal() : null }
                <TitleAndDescription title="Dashboards" className="pt4 pb1"/>
                <div className="flex align-center pb1">
                    <SearchHeader
                        searchText={searchText}
                        setSearchText={(text) => this.setState({searchText})}
                    />
                    <div
                        className="link flex-align-right px4 cursor-pointer"
                        onClick={this.toggleModal}
                    >
                        <div className="flex align-center">
                            <Icon name="add" size={16}/>
                            <h3 className="ml1">Add to new dashboard</h3>
                        </div>
                    </div>
                </div>
                { dashboards.length === 0 ?
                    <WhatsADashboard button={
                        <a onClick={this.toggleModal} className="Button Button--primary">Create a dashboard</a>
                    }/>
                    : <DashboardList dashboards={dashboards}/>
                }
            </LoadingAndErrorWrapper>
        );
    }
}
