/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { connect } from "react-redux";

import SidebarLayout from "metabase/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import * as metadataActions from "metabase/redux/metadata";
import MetricDetail from "metabase/reference/metrics/MetricDetail";
import * as actions from "metabase/reference/reference";

import { getUser, getMetric, getMetricId, getDatabaseId } from "../selectors";

import MetricSidebar from "./MetricSidebar";

const mapStateToProps = (state, props) => ({
  user: getUser(state, props),
  metric: getMetric(state, props),
  metricId: getMetricId(state, props),
  databaseId: getDatabaseId(state, props),
});

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

class MetricDetailContainer extends Component {
  static propTypes = {
    router: PropTypes.shape({
      replace: PropTypes.func.isRequired,
    }).isRequired,
    params: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    user: PropTypes.object.isRequired,
    metric: PropTypes.object.isRequired,
    metricId: PropTypes.number.isRequired,
    databaseId: PropTypes.number.isRequired,
  };

  constructor(props) {
    super(props);
    this.startEditing = this.startEditing.bind(this);
    this.endEditing = this.endEditing.bind(this);
  }

  async fetchContainerData() {
    await actions.wrappedFetchMetricDetail(this.props, this.props.metricId);
  }

  startEditing() {
    const { metric, router } = this.props;
    router.replace(`/reference/metrics/${metric.id}/edit`);
    MetabaseAnalytics.trackStructEvent("Data Reference", "Started Editing");
  }

  endEditing() {
    const { metric, router } = this.props;
    router.replace(`/reference/metrics/${metric.id}`);
    // No need to track end of editing here, as it's done by actions.clearState below
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
    const { location, user, metric } = this.props;
    const isEditing = location.pathname.endsWith("/edit");

    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<MetricSidebar metric={metric} user={user} />}
      >
        <MetricDetail
          {...this.props}
          isEditing={isEditing}
          startEditing={this.startEditing}
          endEditing={this.endEditing}
        />
      </SidebarLayout>
    );
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(MetricDetailContainer);
