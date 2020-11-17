/* @flow  */

import React, { Component } from "react";
import { t } from "ttag";
import { Flex } from "grid-styled";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import ModalContent from "metabase/components/ModalContent";
import DashboardPicker from "metabase/containers/DashboardPicker";

import * as Urls from "metabase/lib/urls";

import type {
  Dashboard as DashboardType,
  DashboardId,
} from "metabase-types/types/Dashboard";
import type { Card } from "metabase-types/types/Card";

import Dashboard from "metabase/entities/dashboards";

export default class AddToDashSelectDashModal extends Component {
  state = {
    shouldCreateDashboard: false,
  };

  props: {
    card: Card,
    onClose: () => void,
    onChangeLocation: string => void,
    // via connect:
    createDashboard: DashboardType => any,
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
        <Dashboard.ModalForm
          dashboard={{ collection_id: this.props.card.collection_id }}
          onSaved={dashboard => this.addToDashboard(dashboard.id)}
          onClose={() => this.setState({ shouldCreateDashboard: false })}
        />
      );
    } else {
      return (
        <ModalContent
          id="AddToDashSelectDashModal"
          title={t`Add this question to a dashboard`}
          onClose={this.props.onClose}
        >
          <DashboardPicker onChange={this.addToDashboard} />
          <Link
            mt={1}
            onClick={() => this.setState({ shouldCreateDashboard: true })}
          >
            <Flex align="center" className="text-brand" py={2}>
              <Icon name="add" mx={1} bordered />
              <h4>{t`Create a new dashboard`}</h4>
            </Flex>
          </Link>
        </ModalContent>
      );
    }
  }
}
