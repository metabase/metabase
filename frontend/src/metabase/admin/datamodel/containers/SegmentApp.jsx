/* eslint-disable react/prop-types */
import { Component, useCallback } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import Segments from "metabase/entities/segments";
import { useCallbackEffect } from "metabase/hooks/use-callback-effect";

import { updatePreviewSummary } from "../datamodel";
import { getPreviewSummary } from "../selectors";
import SegmentForm from "../components/SegmentForm";

const mapDispatchToProps = {
  updatePreviewSummary,
  createSegment: Segments.actions.create,
  updateSegment: Segments.actions.update,
  onChangeLocation: push,
};

const mapStateToProps = (state, props) => ({
  previewSummary: getPreviewSummary(state),
});

const UpdateSegmentFormInner = ({
  segment,
  updateSegment,
  onChangeLocation,
  ...props
}) => {
  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [isCallbackScheduled, scheduleCallback] = useCallbackEffect();

  const handleSubmit = useCallback(
    async segment => {
      await updateSegment(segment);
      MetabaseAnalytics.trackStructEvent("Data Model", "Segment Updated");

      scheduleCallback(() => {
        onChangeLocation("/admin/datamodel/segments");
      });
    },
    [updateSegment, onChangeLocation, scheduleCallback],
  );

  return (
    <SegmentForm
      {...props}
      disableLeaveConfirmationModal={isCallbackScheduled}
      segment={segment.getPlainObject()}
      onSubmit={handleSubmit}
    />
  );
};

const UpdateSegmentForm = Segments.load({
  id: (state, props) => parseInt(props.params.id),
})(UpdateSegmentFormInner);

const CreateSegmentForm = ({ createSegment, onChangeLocation, ...props }) => {
  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [isCallbackScheduled, scheduleCallback] = useCallbackEffect();

  const handleSubmit = useCallback(
    async segment => {
      await createSegment({
        ...segment,
        table_id: segment.definition["source-table"],
      });
      MetabaseAnalytics.trackStructEvent("Data Model", "Segment Updated");

      scheduleCallback(() => {
        onChangeLocation("/admin/datamodel/segments");
      });
    },
    [createSegment, onChangeLocation, scheduleCallback],
  );

  return (
    <SegmentForm
      {...props}
      disableLeaveConfirmationModal={isCallbackScheduled}
      onSubmit={handleSubmit}
    />
  );
};

class SegmentApp extends Component {
  render() {
    return this.props.params.id ? (
      <UpdateSegmentForm {...this.props} />
    ) : (
      <CreateSegmentForm {...this.props} />
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(SegmentApp);
