/* eslint-disable react/prop-types */
import { useCallback, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import { LeaveConfirmationModal } from "metabase/components/LeaveConfirmationModal";
import Segments from "metabase/entities/segments";
import * as MetabaseAnalytics from "metabase/lib/analytics";

import SegmentForm from "../components/SegmentForm";
import { updatePreviewSummary } from "../datamodel";
import { getPreviewSummary } from "../selectors";

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
  route,
  segment,
  updateSegment,
  onChangeLocation,
  ...props
}) => {
  const [isDirty, setIsDirty] = useState(false);

  const handleSubmit = useCallback(
    async segment => {
      setIsDirty(false);

      try {
        await updateSegment(segment);
        MetabaseAnalytics.trackStructEvent("Data Model", "Segment Updated");
        onChangeLocation("/admin/datamodel/segments");
      } catch (error) {
        setIsDirty(isDirty);
      }
    },
    [updateSegment, isDirty, onChangeLocation],
  );

  return (
    <>
      <SegmentForm
        {...props}
        segment={segment.getPlainObject()}
        onIsDirtyChange={setIsDirty}
        onSubmit={handleSubmit}
      />
      <LeaveConfirmationModal isEnabled={isDirty} route={route} />
    </>
  );
};

const UpdateSegmentForm = Segments.load({
  id: (state, props) => parseInt(props.params.id),
})(UpdateSegmentFormInner);

const CreateSegmentForm = ({
  route,
  createSegment,
  onChangeLocation,
  ...props
}) => {
  const [isDirty, setIsDirty] = useState(false);

  const handleSubmit = useCallback(
    async segment => {
      setIsDirty(false);

      try {
        await createSegment({
          ...segment,
          table_id: segment.definition["source-table"],
        });
        MetabaseAnalytics.trackStructEvent("Data Model", "Segment Updated");
        onChangeLocation("/admin/datamodel/segments");
      } catch (error) {
        setIsDirty(isDirty);
      }
    },
    [createSegment, isDirty, onChangeLocation],
  );

  return (
    <>
      <SegmentForm
        {...props}
        onIsDirtyChange={setIsDirty}
        onSubmit={handleSubmit}
      />
      <LeaveConfirmationModal isEnabled={isDirty} route={route} />
    </>
  );
};

const SegmentApp = props => {
  if (props.params.id) {
    return <UpdateSegmentForm {...props} />;
  }

  return <CreateSegmentForm {...props} />;
};

export default connect(mapStateToProps, mapDispatchToProps)(SegmentApp);
