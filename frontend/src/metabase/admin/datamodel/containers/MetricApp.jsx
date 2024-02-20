/* eslint-disable react/prop-types */
import { useCallback, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import { LeaveConfirmationModal } from "metabase/components/LeaveConfirmationModal";
import Metrics from "metabase/entities/metrics";
import * as MetabaseAnalytics from "metabase/lib/analytics";

import MetricForm from "../components/MetricForm";
import { updatePreviewSummary } from "../datamodel";
import { getPreviewSummary } from "../selectors";

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
  route,
  metric,
  updateMetric,
  onChangeLocation,
  ...props
}) => {
  const [isDirty, setIsDirty] = useState(false);

  const handleSubmit = useCallback(
    async metric => {
      setIsDirty(false);

      try {
        await updateMetric(metric);
        MetabaseAnalytics.trackStructEvent("Data Model", "Metric Updated");
        onChangeLocation("/admin/datamodel/metrics");
      } catch (error) {
        setIsDirty(isDirty);
      }
    },
    [updateMetric, isDirty, onChangeLocation],
  );

  return (
    <>
      <MetricForm
        {...props}
        metric={metric.getPlainObject()}
        onIsDirtyChange={setIsDirty}
        onSubmit={handleSubmit}
      />
      <LeaveConfirmationModal isEnabled={isDirty} route={route} />
    </>
  );
};

const UpdateMetricForm = Metrics.load({
  id: (state, props) => parseInt(props.params.id),
})(UpdateMetricFormInner);

const CreateMetricForm = ({
  route,
  createMetric,
  onChangeLocation,
  ...props
}) => {
  const [isDirty, setIsDirty] = useState(false);

  const handleSubmit = useCallback(
    async metric => {
      setIsDirty(false);

      try {
        await createMetric({
          ...metric,
          table_id: metric.definition["source-table"],
        });
        MetabaseAnalytics.trackStructEvent("Data Model", "Metric Updated");
        onChangeLocation("/admin/datamodel/metrics");
      } catch (error) {
        setIsDirty(isDirty);
        throw error;
      }
    },
    [createMetric, isDirty, onChangeLocation],
  );

  return (
    <>
      <MetricForm
        {...props}
        onIsDirtyChange={setIsDirty}
        onSubmit={handleSubmit}
      />
      <LeaveConfirmationModal isEnabled={isDirty} route={route} />
    </>
  );
};

const MetricApp = props => {
  if (props.params.id) {
    return <UpdateMetricForm {...props} />;
  }

  return <CreateMetricForm {...props} />;
};

export default connect(mapStateToProps, mapDispatchToProps)(MetricApp);
