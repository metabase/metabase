/* eslint-disable react/prop-types */
import { useCallback, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import Metrics from "metabase/entities/metrics";
import { useCallbackEffect } from "metabase/hooks/use-callback-effect";
import { LeaveConfirmationModal } from "metabase/components/LeaveConfirmationModal";

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
  const handleSubmit = useCallback(
    async metric => {
      await updateMetric(metric);
      MetabaseAnalytics.trackStructEvent("Data Model", "Metric Updated");
      onChangeLocation("/admin/datamodel/metrics");
    },
    [updateMetric, onChangeLocation],
  );

  return (
    <MetricForm
      {...props}
      metric={metric.getPlainObject()}
      onSubmit={handleSubmit}
    />
  );
};

const UpdateMetricForm = Metrics.load({
  id: (state, props) => parseInt(props.params.id),
})(UpdateMetricFormInner);

const CreateMetricForm = ({ createMetric, onChangeLocation, ...props }) => {
  const handleSubmit = useCallback(
    async metric => {
      await createMetric({
        ...metric,
        table_id: metric.definition["source-table"],
      });
      MetabaseAnalytics.trackStructEvent("Data Model", "Metric Updated");
      onChangeLocation("/admin/datamodel/metrics");
    },
    [createMetric, onChangeLocation],
  );

  return <MetricForm {...props} onSubmit={handleSubmit} />;
};

const MetricApp = ({ onChangeLocation, route, ...props }) => {
  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [isCallbackScheduled, scheduleCallback] = useCallbackEffect();
  const [isDirty, setIsDirty] = useState(false);

  const handleChangeLocation = useCallback(
    location => {
      scheduleCallback(() => {
        onChangeLocation(location);
      });
    },
    [scheduleCallback, onChangeLocation],
  );

  const SegmentAppForm = props.params.id ? UpdateMetricForm : CreateMetricForm;

  return (
    <>
      <SegmentAppForm
        onIsDirtyChange={setIsDirty}
        onChangeLocation={handleChangeLocation}
        {...props}
      />
      <LeaveConfirmationModal
        isEnabled={isDirty && !isCallbackScheduled}
        route={route}
      />
    </>
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(MetricApp);
