import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { connect } from "react-redux";
import { withRouter } from "react-router";
import { push } from "react-router-redux";

import * as Urls from "metabase/lib/urls";

import Dashboard from "metabase/entities/dashboards";

import ArchiveModal from "metabase/components/ArchiveModal";

const mapDispatchToProps = {
  setDashboardArchived: Dashboard.actions.setArchived,
  push,
};

@connect(
  null,
  mapDispatchToProps,
)
@Dashboard.load({ id: (state, props) => props.params.dashboardId })
@withRouter
export default class ArchiveDashboardModal extends Component {
  static propTypes = {
    onClose: PropTypes.func,
  };

  close = () => {
    // since we need to redirect back to the parent collection when archiving
    // we have to call this here first to unmount the modal and then push to the
    // parent collection
    this.props.onClose();
    if (this.props.dashboard.archived) {
      this.props.push(Urls.collection(this.props.dashboard.collection_id));
    }
  };

  archive = async () => {
    await this.props.setDashboardArchived(
      { id: this.props.params.dashboardId },
      true,
    );
  };

  render() {
    return (
      <ArchiveModal
        title={t`Archive this dashboard?`}
        message={t`Are you sure you want to do this?`}
        onClose={this.close}
        onArchive={this.archive}
      />
    );
  }
}
