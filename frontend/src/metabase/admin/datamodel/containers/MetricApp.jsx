/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import Metrics from "metabase/entities/metrics";

import { updatePreviewSummary } from "../datamodel";
import { getPreviewSummary } from "../selectors";
import MetricForm from "../components/MetricForm";

const mapDispatchToProps = {
  updatePreviewSummary,
  createMetric: Metrics.actions.create,
  updateMetric: Metrics.actions.update,
  onChangeLocation: push,
};

const mapStateToProps = (state, props) => ({
  previewSummary: getPreviewSummary(state),
});

class UpdateMetricFormInner extends Component {
  onSubmit = async metric => {
    await this.props.updateMetric(metric);
    MetabaseAnalytics.trackStructEvent("Data Model", "Metric Updated");
    this.props.onChangeLocation(`/admin/datamodel/metrics`);
  };

  render() {
    const { metric, ...props } = this.props;
    return (
      <MetricForm
        {...props}
        metric={metric.getPlainObject()}
        onSubmit={this.onSubmit}
      />
    );
  }
}

const UpdateMetricForm = Metrics.load({
  id: (state, props) => parseInt(props.params.id),
})(UpdateMetricFormInner);

class CreateMetricForm extends Component {
  onSubmit = async metric => {
    await this.props.createMetric({
      ...metric,
      table_id: metric.definition["source-table"],
    });
    MetabaseAnalytics.trackStructEvent("Data Model", "Metric Updated");
    this.props.onChangeLocation(`/admin/datamodel/metrics`);
  };

  render() {
    return <MetricForm {...this.props} onSubmit={this.onSubmit} />;
  }
}

class MetricApp extends Component {
  render() {
    return this.props.params.id ? (
      <UpdateMetricForm {...this.props} />
    ) : (
      <CreateMetricForm {...this.props} />
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(MetricApp);
