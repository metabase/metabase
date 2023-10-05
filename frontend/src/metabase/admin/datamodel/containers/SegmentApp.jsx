/* eslint-disable react/prop-types */
import { useCallback, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import Segments from "metabase/entities/segments";
import { useCallbackEffect } from "metabase/hooks/use-callback-effect";
import { LeaveConfirmationModal } from "metabase/components/LeaveConfirmationModal";

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
  const handleSubmit = useCallback(
    async segment => {
      await updateSegment(segment);
      MetabaseAnalytics.trackStructEvent("Data Model", "Segment Updated");
      onChangeLocation("/admin/datamodel/segments");
    },
    [updateSegment, onChangeLocation],
  );

  return (
    <SegmentForm
      {...props}
      segment={segment.getPlainObject()}
      onSubmit={handleSubmit}
    />
  );
};

const UpdateSegmentForm = Segments.load({
  id: (state, props) => parseInt(props.params.id),
})(UpdateSegmentFormInner);

const CreateSegmentForm = ({ createSegment, onChangeLocation, ...props }) => {
  const handleSubmit = useCallback(
    async segment => {
      await createSegment({
        ...segment,
        table_id: segment.definition["source-table"],
      });
      MetabaseAnalytics.trackStructEvent("Data Model", "Segment Updated");
      onChangeLocation("/admin/datamodel/segments");
    },
    [createSegment, onChangeLocation],
  );

  return <SegmentForm {...props} onSubmit={handleSubmit} />;
};

const SegmentApp = ({ route, onChangeLocation, ...props }) => {
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

  const SegmentAppForm = props.params.id
    ? UpdateSegmentForm
    : CreateSegmentForm;

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

export default connect(mapStateToProps, mapDispatchToProps)(SegmentApp);
