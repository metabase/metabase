import { useCallback, useState } from "react";
import _ from "underscore";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import { Segments } from "metabase/entities/segments";
import { Tables } from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";
import { useNavigation } from "metabase/routing";
import type { Segment } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { SegmentForm } from "../components/SegmentForm";

type SegmentAppOwnProps = {
  params: {
    id: string;
  };
};

type SegmentAppDispatchProps = {
  createSegment: (segment: Partial<Segment>) => Promise<Segment>;
  updateSegment: (segment: Partial<Segment>) => Promise<Segment>;
};

const mapDispatchToProps: SegmentAppDispatchProps = {
  createSegment: Segments.actions.create,
  updateSegment: Segments.actions.update,
};

type UpdateSegmentFormInnerProps = SegmentAppOwnProps &
  SegmentAppDispatchProps & {
    segment: Segment & {
      // Attributes from entity framework object wrapper
      getPlainObject(): Segment;
    };
  };

function UpdateSegmentFormInner({
  segment,
  updateSegment,
}: UpdateSegmentFormInnerProps) {
  const { push } = useNavigation();
  const [isDirty, setIsDirty] = useState(false);

  const handleSubmit = useCallback(
    async (segmentValues: Partial<Segment>) => {
      setIsDirty(false);

      try {
        await updateSegment(segmentValues);
        push("/admin/datamodel/segments");
      } catch {
        setIsDirty(isDirty);
      }
    },
    [updateSegment, isDirty, push],
  );

  return (
    <>
      <SegmentForm
        segment={segment.getPlainObject()}
        onIsDirtyChange={setIsDirty}
        onSubmit={handleSubmit}
      />

      <LeaveRouteConfirmModal isEnabled={isDirty} />
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
  ...props
}: CreateSegmentFormProps) {
  const { push } = useNavigation();
  const [isDirty, setIsDirty] = useState(false);

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
          await createSegment(segment);
          push("/admin/datamodel/segments");
        } catch {
          setIsDirty(isDirty);
        }
      });
    },
    [scheduleCallback, createSegment, isDirty, push],
  );

  return (
    <>
      <SegmentForm
        {...props}
        onIsDirtyChange={setIsDirty}
        onSubmit={handleSubmit}
      />

      <LeaveRouteConfirmModal isEnabled={isDirty} />
    </>
  );
}

type SegmentAppInnerProps = SegmentAppOwnProps & SegmentAppDispatchProps;

function SegmentAppInner(props: SegmentAppInnerProps) {
  const { params } = props;
  if (params.id) {
    return <UpdateSegmentForm {...props} />;
  }

  return <CreateSegmentForm {...props} />;
}

export const SegmentApp = connect(null, mapDispatchToProps)(SegmentAppInner);
