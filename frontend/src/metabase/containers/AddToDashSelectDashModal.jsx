/* @flow  */

import React, { Component } from "react";
import { t } from "c-3po";

import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent.jsx";
import DashboardForm from "metabase/containers/DashboardForm.jsx";
import DashboardPicker from "metabase/containers/DashboardPicker";

import * as Urls from "metabase/lib/urls";

import type { Dashboard, DashboardId } from "metabase/meta/types/Dashboard";
import type { Card } from "metabase/meta/types/Card";

export default class AddToDashSelectDashModal extends Component {
  state = {
    shouldCreateDashboard: false,
  };

  props: {
    card: Card,
    onClose: () => void,
    onChangeLocation: string => void,
    // via connect:
    createDashboard: Dashboard => any,
  };

  addToDashboard = (dashboardId: DashboardId) => {
    // we send the user over to the chosen dashboard in edit mode with the current card added
    this.props.onChangeLocation(
      Urls.dashboard(dashboardId, { addCardWithId: this.props.card.id }),
    );
  };

  render() {
    if (this.state.shouldCreateDashboard) {
      return (
        <DashboardForm
          dashboard={{ collection_id: this.props.card.collection_id }}
          onSaved={dashboard => this.addToDashboard(dashboard.id)}
          onClose={() => this.setState({ shouldCreateDashboard: false })}
        />
      );
    } else {
      return (
        <ModalContent
          id="AddToDashSelectDashModal"
          title={t`Add Question to Dashboard`}
          onClose={this.props.onClose}
        >
          <DashboardPicker onChange={this.addToDashboard} />
          <Button
            mt={1}
            onClick={() => this.setState({ shouldCreateDashboard: true })}
          >
            {t`Create New Dashboard`}
          </Button>
        </ModalContent>
      );
    }
  }
}
