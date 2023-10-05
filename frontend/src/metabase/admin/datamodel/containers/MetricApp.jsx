/* eslint-disable react/prop-types */
import { Component, useCallback } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import Metrics from "metabase/entities/metrics";
import { useCallbackEffect } from "metabase/hooks/use-callback-effect";

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

const UpdateMetricFormInner = ({
  metric,
  updateMetric,
  onChangeLocation,
  ...props
}) => {
  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [isCallbackScheduled, scheduleCallback] = useCallbackEffect();

  const handleSubmit = useCallback(
    async metric => {
      await updateMetric(metric);
      MetabaseAnalytics.trackStructEvent("Data Model", "Metric Updated");

      scheduleCallback(() => {
        onChangeLocation("/admin/datamodel/metrics");
      });
    },
    [updateMetric, onChangeLocation, scheduleCallback],
  );

  return (
    <MetricForm
      {...props}
      disableLeaveConfirmationModal={isCallbackScheduled}
      metric={metric.getPlainObject()}
      onSubmit={handleSubmit}
    />
  );
};

const UpdateMetricForm = Metrics.load({
  id: (state, props) => parseInt(props.params.id),
})(UpdateMetricFormInner);

const CreateMetricForm = ({ createMetric, onChangeLocation, ...props }) => {
  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [isCallbackScheduled, scheduleCallback] = useCallbackEffect();

  const handleSubmit = useCallback(
    async metric => {
      await createMetric({
        ...metric,
        table_id: metric.definition["source-table"],
      });
      MetabaseAnalytics.trackStructEvent("Data Model", "Metric Updated");

      scheduleCallback(() => {
        onChangeLocation("/admin/datamodel/metrics");
      });
    },
    [createMetric, onChangeLocation, scheduleCallback],
  );

  return (
    <MetricForm
      {...props}
      disableLeaveConfirmationModal={isCallbackScheduled}
      onSubmit={handleSubmit}
    />
  );
};

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
