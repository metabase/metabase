import React, { Component, PropTypes } from "react";

import CreateDashboardModal from 'metabase/components/CreateDashboardModal.jsx';
import Icon from 'metabase/components/Icon.jsx';
import ModalContent from "metabase/components/ModalContent.jsx";
import SortableItemList from 'metabase/components/SortableItemList.jsx';

import Urls from "metabase/lib/urls";
import { DashboardApi } from "metabase/services";

import moment from 'moment';

export default class AddToDashSelectDashModal extends Component {
    constructor(props, context) {
        super(props, context);
        this.addToDashboard = this.addToDashboard.bind(this);
        this.createDashboard = this.createDashboard.bind(this);
        this.loadDashboardList();

        this.state = {
            dashboards: null,
            shouldCreateDashboard: false
        };
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        closeFn: PropTypes.func.isRequired,
        onChangeLocation: PropTypes.func.isRequired
    };

    async loadDashboardList() {
        // TODO: reduxify
        var dashboards = await DashboardApi.list({ f: "all" });
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
        // TODO: reduxify
        let dashboard = await DashboardApi.create(newDashboard);
        // this.props.notifyDashboardCreatedFn(dashboard);
        this.addToDashboard(dashboard);
    }

    render() {
        if (!this.state.dashboards) {
            return null;
        } else if (this.state.dashboards.length === 0 || this.state.shouldCreateDashboard === true) {
            return <CreateDashboardModal createDashboardFn={this.createDashboard} closeFn={this.props.closeFn} />
        } else {
            return (
                <ModalContent
                    id="AddToDashSelectDashModal"
                    title="Add Question to Dashboard"
                    closeFn={this.props.closeFn}
                >
                <div className="flex flex-column">
                    <div
                        className="link flex-align-right px4 cursor-pointer"
                        onClick={() => this.setState({ shouldCreateDashboard: true })}
                    >
                        <div
                            className="mt1 flex align-center absolute"
                            style={ { right: 40 } }
                        >
                            <Icon name="add" size={16} />
                            <h3 className="ml1">Add to new dashboard</h3>
                        </div>
                    </div>
                    <SortableItemList
                        items={this.state.dashboards}
                        onClickItemFn={this.addToDashboard}
                    />
                </div>
                </ModalContent>
            );
        }
    }
}
