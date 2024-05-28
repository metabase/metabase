/* eslint-disable react/prop-types */
import PropTypes from "prop-types";
import { Component } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import ArchiveModal from "metabase/components/ArchiveModal";
import { setArchivedDashboard } from "metabase/dashboard/actions";
import Collection from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import * as Urls from "metabase/lib/urls";

const mapDispatchToProps = dispatch => ({
  setDashboardArchived: () => dispatch(setArchivedDashboard(true)),
  push: path => dispatch(push(path)),
});

class ArchiveDashboardModal extends Component {
  static propTypes = {
    onClose: PropTypes.func,
  };

  archive = async () => {
    const dashboardId = Urls.extractEntityId(this.props.params.slug);
    await this.props.setDashboardArchived(dashboardId);
  };

  render() {
    const { dashboard } = this.props;
    return (
      <ArchiveModal
        title={
          dashboard.is_app_age
            ? t`Move this page to trash?`
            : t`Move this dashboard to trash?`
        }
        message={t`Are you sure you want to do this?`}
        onClose={this.props.onClose}
        onArchive={this.archive}
      />
    );
  }
}

export const ArchiveDashboardModalConnected = _.compose(
  connect(null, mapDispatchToProps),
  Dashboards.load({
    id: (state, props) => Urls.extractCollectionId(props.params.slug),
  }),
  Collection.load({
    id: (state, props) => props.dashboard && props.dashboard.collection_id,
  }),
  withRouter,
)(ArchiveDashboardModal);
