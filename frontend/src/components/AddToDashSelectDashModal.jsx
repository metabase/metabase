import React, { Component, PropTypes } from "react";

import CreateDashboardModal from 'metabase/components/CreateDashboardModal.jsx';
import ModalContent from "metabase/components/ModalContent.jsx";
import SortableItemList from 'metabase/components/SortableItemList.jsx';

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
        dashboardApi: PropTypes.func.isRequired,
        closeFn: PropTypes.func.isRequired,
        notifyCardAddedToDashFn: PropTypes.func.isRequired
    };

    async loadDashboardList() {
        var dashboards = await this.props.dashboardApi.list({
            'filterMode': 'all'
        }).$promise;
        for (var dashboard of dashboards) {
            dashboard.updated_at = moment(dashboard.updated_at);
        }
        this.setState({ dashboards });
    }

    async addToDashboard(dashboard) {
        var dashCard = await this.props.dashboardApi.addcard({
            'dashId': dashboard.id,
            'cardId': this.props.card.id
        }).$promise;
        this.props.notifyCardAddedToDashFn(dashCard);
    }

    async createDashboard(newDashboard) {
        let dashboard = await this.props.dashboardApi.create(newDashboard).$promise;
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
