import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";

import MetricForm from "./MetricForm.jsx";

import { metricEditSelectors } from "../selectors";
import * as actions from "../datamodel";
import { clearRequestState } from "metabase/redux/requests";
import { fetchTableMetadata } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

const mapDispatchToProps = {
  ...actions,
  fetchTableMetadata,
  clearRequestState,
  onChangeLocation: push,
};

const mapStateToProps = (state, props) => ({
  ...metricEditSelectors(state, props),
  metadata: getMetadata(state, props),
});

@connect(mapStateToProps, mapDispatchToProps)
export default class MetricApp extends Component {
  async componentWillMount() {
    const { params, location } = this.props;

    let tableId;
    if (params.id) {
      const metricId = parseInt(params.id);
      const { payload: metric } = await this.props.getMetric({ metricId });
      tableId = metric.table_id;
    } else if (location.query.table) {
      tableId = parseInt(location.query.table);
    }

    if (tableId != null) {
      // TODO Atte Keinänen 6/8/17: Use only global metadata (`fetchTableMetadata`)
      this.props.loadTableMetadata(tableId);
      this.props.fetchTableMetadata(tableId);
    }
  }

  async onSubmit(metric, f) {
    let { tableMetadata } = this.props;
    if (metric.id != null) {
      await this.props.updateMetric(metric);
      this.props.clearRequestState({ statePath: ["entities", "metrics"] });
      MetabaseAnalytics.trackEvent("Data Model", "Metric Updated");
    } else {
      await this.props.createMetric(metric);
      this.props.clearRequestState({ statePath: ["entities", "metrics"] });
      MetabaseAnalytics.trackEvent("Data Model", "Metric Created");
    }

    this.props.onChangeLocation(
      "/admin/datamodel/database/" +
        tableMetadata.db_id +
        "/table/" +
        tableMetadata.id,
    );
  }

  render() {
    return (
      <div>
        <MetricForm {...this.props} onSubmit={this.onSubmit.bind(this)} />
      </div>
    );
  }
}
