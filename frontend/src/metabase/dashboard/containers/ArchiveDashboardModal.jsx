/* eslint-disable react/prop-types */
import PropTypes from "prop-types";
import { Component } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { ArchiveModal } from "metabase/components/ArchiveModal";
import { setArchivedDashboard } from "metabase/dashboard/actions";
import Collections from "metabase/entities/collections";
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

  constructor(props) {
    super(props);
    this.state = { loading: false };
  }

  archive = async () => {
    const dashboardId = Urls.extractEntityId(this.props.params.slug);
    this.setState({ loading: true });
    await this.props.setDashboardArchived(dashboardId);
    this.setState({ loading: false });
  };

  render() {
    const { dashboard } = this.props;

    const hasDashboardQuestions = dashboard.dashcards
      .filter(dc => dc.card) // card might be null for virtual cards
      .some(dc => _.isNumber(dc.card.dashboard_id));

    const message = hasDashboardQuestions
      ? t`This will trash the dashboard and the questions that are saved in it. Are you sure you want to do this?`
      : t`Are you sure you want to do this?`;

    return (
      <ArchiveModal
        title={
          dashboard.is_app_age
            ? t`Move this page to trash?`
            : t`Move this dashboard to trash?`
        }
        model="dashboard"
        modelId={dashboard?.id}
        message={message}
        onClose={this.props.onClose}
        isLoading={this.state.loading}
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
  Collections.load({
    id: (state, props) => props.dashboard && props.dashboard.collection_id,
  }),
  withRouter,
)(ArchiveDashboardModal);
