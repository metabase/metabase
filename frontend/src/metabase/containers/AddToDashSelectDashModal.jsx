/* @flow  */

import React, { Component } from "react";
import { connect } from "react-redux";

import CreateDashboardModal from "metabase/components/CreateDashboardModal.jsx";
import Icon from "metabase/components/Icon.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";
import SortableItemList from "metabase/components/SortableItemList.jsx";
import * as Urls from "metabase/lib/urls";

import * as dashboardsActions from "metabase/dashboards/dashboards";
import { getDashboardListing } from "metabase/dashboards/selectors";
import { t } from "c-3po";
import type { Dashboard } from "metabase/meta/types/Dashboard";
import type { Card } from "metabase/meta/types/Card";
const mapStateToProps = state => ({
  dashboards: getDashboardListing(state),
});

const mapDispatchToProps = {
  fetchDashboards: dashboardsActions.fetchDashboards,
  createDashboard: dashboardsActions.createDashboard,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class AddToDashSelectDashModal extends Component {
  state = {
    shouldCreateDashboard: false,
  };

  props: {
    card: Card,
    onClose: () => void,
    onChangeLocation: string => void,
    // via connect:
    dashboards: Dashboard[],
    fetchDashboards: () => any,
    createDashboard: Dashboard => any,
  };

  componentWillMount() {
    this.props.fetchDashboards();
  }

  addToDashboard = (dashboard: Dashboard) => {
    // we send the user over to the chosen dashboard in edit mode with the current card added
    this.props.onChangeLocation(
      Urls.dashboard(dashboard.id, { addCardWithId: this.props.card.id }),
    );
  };

  createDashboard = async (newDashboard: Dashboard) => {
    try {
      const action = await this.props.createDashboard(newDashboard, {});
      this.addToDashboard(action.payload);
    } catch (e) {
      console.log("createDashboard failed", e);
    }
  };

  render() {
    if (this.props.dashboards === null) {
      return <div />;
    } else if (
      this.props.dashboards.length === 0 ||
      this.state.shouldCreateDashboard === true
    ) {
      return (
        <CreateDashboardModal
          createDashboardFn={this.createDashboard}
          onClose={this.props.onClose}
        />
      );
    } else {
      return (
        <ModalContent
          id="AddToDashSelectDashModal"
          title={t`Add Question to Dashboard`}
          onClose={this.props.onClose}
        >
          <div className="flex flex-column">
            <div
              className="link flex-align-right px4 cursor-pointer"
              onClick={() => this.setState({ shouldCreateDashboard: true })}
            >
              <div
                className="mt1 flex align-center absolute"
                style={{ right: 40 }}
              >
                <Icon name="add" size={16} />
                <h3 className="ml1">{t`Add to new dashboard`}</h3>
              </div>
            </div>
            <SortableItemList
              items={this.props.dashboards}
              onClickItemFn={this.addToDashboard}
            />
          </div>
        </ModalContent>
      );
    }
  }
}
