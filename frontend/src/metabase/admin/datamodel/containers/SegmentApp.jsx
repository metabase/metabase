/* eslint-disable react/prop-types */
import { useCallback, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";

import { LeaveConfirmationModal } from "metabase/components/LeaveConfirmationModal";
import Segments from "metabase/entities/segments";
import Tables from "metabase/entities/tables";
import { useCallbackEffect } from "metabase/hooks/use-callback-effect";

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

const UpdateSegmentForm = _.compose(
  Segments.load({
    id: (_state, { params }) => parseInt(params.id),
  }),
  Tables.load({
    id: (_state, { segment }) => segment?.table_id,
    fetchType: "fetchMetadataAndForeignTables",
    requestType: "fetchMetadataDeprecated",
  }),
)(UpdateSegmentFormInner);

const CreateSegmentForm = ({
  route,
  createSegment,
  onChangeLocation,
  ...props
}) => {
  const [isDirty, setIsDirty] = useState(false);

  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [, scheduleCallback] = useCallbackEffect();

  const handleSubmit = useCallback(
    segment => {
      setIsDirty(false);

      scheduleCallback(async () => {
        try {
          await createSegment(segment);
          onChangeLocation("/admin/datamodel/segments");
        } catch (error) {
          setIsDirty(isDirty);
        }
      });
    },
    [scheduleCallback, createSegment, isDirty, onChangeLocation],
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
