'use strict';

import Modal from 'metabase/components/Modal.react';
import RadioSelect from 'metabase/components/RadioSelect.react';

import moment from 'moment';

export default React.createClass({
    displayName: "AddToDashSelectDash",
    propTypes: {
        card: React.PropTypes.object.isRequired,
        dashboardApi: React.PropTypes.func.isRequired,
        closeFn: React.PropTypes.func.isRequired,
        notifyCardAddedToDashFn: React.PropTypes.func.isRequired
    },

    getInitialState: function() {
        this.loadDashboardList();
        return {
            dashboards: [],
            sort: "Last Modified"
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
        if (this.state.sort === "Last Modified") {
            this.state.dashboards.sort((a, b) => a.updated_at < b.updated_at);
        } else if (this.state.sort === "Alphabetical Order") {
            this.state.dashboards.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        }

        var dashboards = this.state.dashboards.map((dashboard) => {
            return (
                <li key={dashboard.id} className="border-row-divider">
                    <a className="no-decoration flex p2" href="#" onClick={this.addToDashboard.bind(null, dashboard)}>
                        <div className="text-brand-hover">
                            <h3 className="mb1">{dashboard.name}</h3>
                            <h4 className="text-grey-3">{dashboard.description || "No description yet"}</h4>
                        </div>
                        <div className="flex-align-right text-right text-grey-3">
                            <div className="mb1">Saved by {dashboard.creator.common_name}</div>
                            <div>Modified {dashboard.updated_at.fromNow()}</div>
                        </div>
                    </a>
                </li>
            );
        });

        return (
            <Modal
                title="Add Question to Dashboard"
                closeFn={this.props.closeFn}
            >
                <div className="flex align-center px2 pb3 border-bottom">
                    <h5 className="text-bold text-uppercase text-grey-3 ml2 mr2">Sort by</h5>
                    <RadioSelect
                        value={this.state.sort}
                        options={["Last Modified", /*"Most Popular",*/  "Alphabetical Order"]}
                        onChange={(sort) => this.setState({ sort })}
                    />
                </div>

                <ul className="px2 mb2">
                    {dashboards}
                </ul>
            </Modal>
        );
    }
});
