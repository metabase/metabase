/* eslint-disable react/prop-types */
import { useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import { trackSegmentCreated } from "metabase/data-studio/analytics";
import { Segments } from "metabase/entities/segments";
import { Tables } from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";

import { SegmentForm } from "../components/SegmentForm";
import { updatePreviewSummary } from "../datamodel";
import { getPreviewSummary } from "../selectors";

const mapDispatchToProps = {
  updatePreviewSummary,
  createSegment: Segments.actions.create,
  updateSegment: Segments.actions.update,
  onChangeLocation: push,
};

const mapStateToProps = (state) => ({
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
    async (segment) => {
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
      <LeaveRouteConfirmModal isEnabled={isDirty} route={route} />
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
  const { sendErrorToast } = useMetadataToasts();

  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [, scheduleCallback] = useCallbackEffect();

  const handleSubmit = useCallback(
    (segment) => {
      setIsDirty(false);

      scheduleCallback(async () => {
        try {
          const { payload } = await createSegment(segment);
          trackSegmentCreated(
            "success",
            "admin_datamodel_segments",
            payload.segment?.id,
          );
          onChangeLocation("/admin/datamodel/segments");
        } catch (error) {
          sendErrorToast(t`Failed to create segment`);
          trackSegmentCreated("failure", "admin_datamodel_segments");
          setIsDirty(isDirty);
        }
      });
    },
    [
      scheduleCallback,
      createSegment,
      onChangeLocation,
      sendErrorToast,
      isDirty,
    ],
  );

  return (
    <>
      <SegmentForm
        {...props}
        onIsDirtyChange={setIsDirty}
        onSubmit={handleSubmit}
      />
      <LeaveRouteConfirmModal isEnabled={isDirty} route={route} />
    </>
  );
};

const SegmentAppInner = (props) => {
  if (props.params.id) {
    return <UpdateSegmentForm {...props} />;
  }

  return <CreateSegmentForm {...props} />;
};

export const SegmentApp = connect(
  mapStateToProps,
  mapDispatchToProps,
)(SegmentAppInner);
