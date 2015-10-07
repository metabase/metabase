import CreateDashboardModal from 'metabase/components/CreateDashboardModal.react';
import ModalContent from "metabase/components/ModalContent.react";
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
            dashboards: null
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

    createDashboard: async function(newDashboard) {
        let dashboard = await this.props.dashboardApi.create(newDashboard).$promise;
        // this.props.notifyDashboardCreatedFn(dashboard);
        this.addToDashboard(dashboard);
    },

    render: function() {
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
});
