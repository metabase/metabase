import React, { Component, PropTypes } from "react";

import CreateDashboardModal from 'metabase/components/CreateDashboardModal.jsx';
import ModalContent from "metabase/components/ModalContent.jsx";
import SortableItemList from 'metabase/components/SortableItemList.jsx';

import Urls from "metabase/lib/urls";

import moment from 'moment';

export default class AddToDashSelectDashModal extends Component {
    constructor(props, context) {
        super(props, context);
        this.addToDashboard = this.addToDashboard.bind(this);
        this.createDashboard = this.createDashboard.bind(this);
        this.loadDashboardList();

        this.state = {
            dashboards: null
        };
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        dashboardApi: PropTypes.object.isRequired,
        closeFn: PropTypes.func.isRequired,
        onChangeLocation: PropTypes.func.isRequired
    };

    async loadDashboardList() {
        var dashboards = await this.props.dashboardApi.list({ f: "all" });
        for (var dashboard of dashboards) {
            dashboard.updated_at = moment(dashboard.updated_at);
        }
        this.setState({ dashboards });
    }

    addToDashboard(dashboard) {
        // we send the user over to the chosen dashboard in edit mode with the current card added
        this.props.onChangeLocation(Urls.dashboard(dashboard.id)+"?add="+this.props.card.id);
    }

    async createDashboard(newDashboard) {
        let dashboard = await this.props.dashboardApi.create(newDashboard);
        // this.props.notifyDashboardCreatedFn(dashboard);
        this.addToDashboard(dashboard);
    }

    render() {
        if (!this.state.dashboards) {
            return null;
        } else if (this.state.dashboards.length === 0) {
            return <CreateDashboardModal createDashboardFn={this.createDashboard} closeFn={this.props.closeFn} />
        } else {
            return (
                <ModalContent
                    id="AddToDashSelectDashModal"
                    title="Add Question to Dashboard"
                    closeFn={this.props.closeFn}
                >
                    <SortableItemList
                        items={this.state.dashboards}
                        onClickItemFn={this.addToDashboard}
                    />
                </ModalContent>
            );
        }
    }
}
