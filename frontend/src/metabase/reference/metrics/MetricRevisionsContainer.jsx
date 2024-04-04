/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { connect } from "react-redux";

import SidebarLayout from "metabase/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import * as metadataActions from "metabase/redux/metadata";
import MetricRevisions from "metabase/reference/metrics/MetricRevisions";
import * as actions from "metabase/reference/reference";

import {
  getUser,
  getMetric,
  getMetricId,
  getDatabaseId,
  getIsEditing,
} from "../selectors";

import MetricSidebar from "./MetricSidebar";

const mapStateToProps = (state, props) => ({
  user: getUser(state, props),
  metric: getMetric(state, props),
  metricId: getMetricId(state, props),
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state, props),
});

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

class MetricRevisionsContainer extends Component {
  static propTypes = {
    params: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    user: PropTypes.object.isRequired,
    metric: PropTypes.object.isRequired,
    metricId: PropTypes.number.isRequired,
    databaseId: PropTypes.number.isRequired,
    isEditing: PropTypes.bool,
  };

  async fetchContainerData() {
    await actions.wrappedFetchMetricRevisions(this.props, this.props.metricId);
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps);
  }

  render() {
    const { user, metric, isEditing } = this.props;

    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<MetricSidebar metric={metric} user={user} />}
      >
        <MetricRevisions {...this.props} />
      </SidebarLayout>
    );
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(MetricRevisionsContainer);
