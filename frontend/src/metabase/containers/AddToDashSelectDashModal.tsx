/* eslint-disable import/order */
/* eslint-disable react/prop-types */
import React, { Component, ComponentPropsWithoutRef } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Link from "metabase/core/components/Link";
import ModalContent from "metabase/components/ModalContent";
import DashboardPicker from "metabase/containers/DashboardPicker";
import type { State } from "metabase-types/store";
import { CreateDashboardFormOwnProps } from "metabase/dashboard/containers/CreateDashboardForm";

import * as Urls from "metabase/lib/urls";

import CreateDashboardModal from "metabase/dashboard/containers/CreateDashboardModal";

import { LinkContent } from "./AddToDashSelectDashModal.styled";
import { Dashboard } from "metabase-types/api";

function mapStateToProps(state: State) {
  return {
    dashboards: state.entities.dashboards,
  };
}

interface AddToDashSelectDashModalState {
  shouldCreateDashboard: boolean;
}

interface AddToDashSelectDashModalProps {
  card: any;
  onChangeLocation: (location: string) => void;
  onClose: () => void;
  dashboards: Record<Dashboard["id"], Dashboard>;
}

type DashboardPickerProps = ComponentPropsWithoutRef<typeof DashboardPicker>;

class AddToDashSelectDashModal extends Component<
  AddToDashSelectDashModalProps,
  AddToDashSelectDashModalState
> {
  state = {
    shouldCreateDashboard: false,
  };

  // ugly hack with the type, could be better
  navigateToDashboard: Required<CreateDashboardFormOwnProps>["onCreate"] =
    dashboard => {
      const { card, onChangeLocation } = this.props;

      onChangeLocation(
        Urls.dashboard(dashboard, {
          editMode: true,
          addCardWithId: card.id,
        }),
      );
    };

  onDashboardSelected: DashboardPickerProps["onChange"] = dashboardId => {
    const dashboard = this.props.dashboards[dashboardId as Dashboard["id"]];
    this.navigateToDashboard(dashboard);
  };

  render() {
    if (this.state.shouldCreateDashboard) {
      return (
        <CreateDashboardModal
          collectionId={this.props.card.collection_id}
          onCreate={this.navigateToDashboard}
          onClose={() => this.setState({ shouldCreateDashboard: false })}
        />
      );
    }

    return (
      <ModalContent
        id="AddToDashSelectDashModal"
        title={
          this.props.card.dataset
            ? t`Add this model to a dashboard`
            : t`Add this question to a dashboard`
        }
        onClose={this.props.onClose}
      >
        <DashboardPicker onChange={this.onDashboardSelected} />
        <Link
          onClick={() => this.setState({ shouldCreateDashboard: true })}
          // `to` needs to be verifies additionally
          to={""}
        >
          <LinkContent>
            <Icon name="add" mx={1} />
            <h4>{t`Create a new dashboard`}</h4>
          </LinkContent>
        </Link>
      </ModalContent>
    );
  }
}

export default connect(mapStateToProps)(AddToDashSelectDashModal);
