import { useCallback, useState } from "react";
import type { Route } from "react-router";
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
import type { Segment } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { SegmentForm } from "../components/SegmentForm";

type SegmentAppOwnProps = {
  params: {
    id: string;
  };
  route: Route;
};

type NormalizedSegmentResponse = {
  payload: {
    segment: Segment;
  };
};

type SegmentAppDispatchProps = {
  createSegment: (
    segment: Partial<Segment>,
  ) => Promise<NormalizedSegmentResponse>;
  updateSegment: (
    segment: Partial<Segment>,
  ) => Promise<NormalizedSegmentResponse>;
  onChangeLocation: (path: string) => void;
};

const mapDispatchToProps: SegmentAppDispatchProps = {
  createSegment: Segments.actions.create,
  updateSegment: Segments.actions.update,
  onChangeLocation: push,
};

type UpdateSegmentFormInnerProps = SegmentAppOwnProps &
  SegmentAppDispatchProps & {
    segment: Segment & {
      // Attributes from entity framework object wrapper
      getPlainObject(): Segment;
    };
  };

function UpdateSegmentFormInner({
  route,
  segment,
  updateSegment,
  onChangeLocation,
}: UpdateSegmentFormInnerProps) {
  const [isDirty, setIsDirty] = useState(false);

  const handleSubmit = useCallback(
    async (segmentValues: Partial<Segment>) => {
      setIsDirty(false);

      try {
        await updateSegment(segmentValues);
        onChangeLocation("/admin/datamodel/segments");
      } catch {
        setIsDirty(isDirty);
      }
    },
    [updateSegment, isDirty, onChangeLocation],
  );

  return (
    <>
      <SegmentForm
        segment={segment.getPlainObject()}
        onIsDirtyChange={setIsDirty}
        onSubmit={handleSubmit}
      />

      <LeaveRouteConfirmModal isEnabled={isDirty} route={route} />
    </>
  );
}

const UpdateSegmentForm = _.compose(
  Segments.load({
    id: (_state: State, { params }: SegmentAppOwnProps) =>
      parseInt(params.id, 10),
  }),
  Tables.load({
    id: (_state: State, { segment }: { segment?: Segment }) =>
      segment?.table_id,
    fetchType: "fetchMetadataAndForeignTables",
    requestType: "fetchMetadataDeprecated",
  }),
)(UpdateSegmentFormInner);

type CreateSegmentFormProps = SegmentAppOwnProps & SegmentAppDispatchProps;

function CreateSegmentForm({
  createSegment,
  route,
  onChangeLocation,
  ...props
}: CreateSegmentFormProps) {
  const [isDirty, setIsDirty] = useState(false);
  const { sendErrorToast } = useMetadataToasts();

  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [, scheduleCallback] = useCallbackEffect();

  const handleSubmit = useCallback(
    (segment: Partial<Segment>) => {
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
          console.warn(error);
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
}

type SegmentAppInnerProps = SegmentAppOwnProps & SegmentAppDispatchProps;

function SegmentAppInner(props: SegmentAppInnerProps) {
  if (props.params.id) {
    return <UpdateSegmentForm {...props} />;
  }

  return <CreateSegmentForm {...props} />;
}

export const SegmentApp = connect(null, mapDispatchToProps)(SegmentAppInner);
