'use strict';

import ModalBody from "metabase/components/ModalBody.react";
import SortableItemList from 'metabase/components/SortableItemList.react';

import moment from 'moment';

export default React.createClass({
    displayName: "AddToDashSelectDashModal",
    propTypes: {
        card: React.PropTypes.object.isRequired,
        dashboardApi: React.PropTypes.func.isRequired,
        closeFn: React.PropTypes.func.isRequired,
        notifyCardAddedToDashFn: React.PropTypes.func.isRequired
    },

    getInitialState: function() {
        this.loadDashboardList();
        return {
            dashboards: []
        };
    },

    loadDashboardList: async function() {
        var dashboards = await this.props.dashboardApi.list({
            'filterMode': 'mine'
        }).$promise;
        for (var dashboard of dashboards) {
            dashboard.updated_at = moment(dashboard.updated_at);
        }
        this.setState({ dashboards });
    },

    addToDashboard: async function(dashboard) {
        var dashCard = await this.props.dashboardApi.addcard({
            'dashId': dashboard.id,
            'cardId': this.props.card.id
        }).$promise;
        this.props.notifyCardAddedToDashFn(dashCard);
    },

    render: function() {
        return (
            <ModalBody
                title="Add Question to Dashboard"
                closeFn={this.props.closeFn}
            >
                <SortableItemList
                    items={this.state.dashboards}
                    onClickItemFn={this.addToDashboard}
                />
            </ModalBody>
        );
    }
});
