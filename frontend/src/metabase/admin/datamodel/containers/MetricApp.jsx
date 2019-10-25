import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import { getMetadata } from "metabase/selectors/metadata";
import Metrics from "metabase/entities/metrics";
import Tables from "metabase/entities/tables";

import { updatePreviewSummary } from "../datamodel";
import { getPreviewSummary } from "../selectors";
import withTableMetadataLoaded from "../withTableMetadataLoaded";
import MetricForm from "./MetricForm";

const mapDispatchToProps = {
  updatePreviewSummary,
  createMetric: Metrics.actions.create,
  onChangeLocation: push,
};

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state),
  previewSummary: getPreviewSummary(state),
});

@Metrics.load({
  id: (state, props) => parseInt(props.params.id),
  wrapped: true,
})
@Tables.load({ id: (state, props) => props.metric.table_id, wrapped: true })
@withTableMetadataLoaded
class UpdateMetricForm extends Component {
  onSubmit = async metric => {
    await this.props.metric.update(metric);
    MetabaseAnalytics.trackEvent("Data Model", "Metric Updated");
    const { id: tableId, db_id: databaseId } = this.props.table;
    this.props.onChangeLocation(
      `/admin/datamodel/database/${databaseId}/table/${tableId}`,
    );
  };

  render() {
    return <MetricForm {...this.props} onSubmit={this.onSubmit} />;
  }
}

@Tables.load({
  id: (state, props) => parseInt(props.location.query.table),
  wrapped: true,
})
@withTableMetadataLoaded
class CreateMetricForm extends Component {
  onSubmit = async metric => {
    const { id: tableId, db_id: databaseId } = this.props.table;
    await this.props.createMetric({ ...metric, table_id: tableId });
    MetabaseAnalytics.trackEvent("Data Model", "Metric Updated");
    this.props.onChangeLocation(
      `/admin/datamodel/database/${databaseId}/table/${tableId}`,
    );
  };

  render() {
    return <MetricForm {...this.props} onSubmit={this.onSubmit} />;
  }
}

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class MetricApp extends Component {
  render() {
    return this.props.params.id ? (
      <UpdateMetricForm {...this.props} />
    ) : (
      <CreateMetricForm {...this.props} />
    );
  }
}
