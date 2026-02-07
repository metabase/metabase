import type { LocationDescriptor } from "history";
import { useCallback, useState } from "react";
import type { PlainRoute } from "react-router";
import { push } from "react-router-redux";
import _ from "underscore";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import { Segments } from "metabase/entities/segments";
import { Tables } from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

import type { SegmentFormProps } from "../components/SegmentForm";
import { SegmentForm } from "../components/SegmentForm";
import { updatePreviewSummary } from "../datamodel";
import { getPreviewSummary } from "../selectors";

const mapDispatchToProps = {
  updatePreviewSummary,
  createSegment: Segments.actions.create,
  updateSegment: Segments.actions.update,
  onChangeLocation: push,
};

const mapStateToProps = (state: State) => ({
  previewSummary: getPreviewSummary(state),
});

interface UpdateSegmentFormInnerProps {
  route: PlainRoute;
  segment: any;
  updateSegment: (segment: any) => Promise<any>;
  onChangeLocation: (location: LocationDescriptor) => void;
  updatePreviewSummary: typeof updatePreviewSummary;
  [key: string]: any;
}

const UpdateSegmentFormInner = ({
  route,
  segment,
  updateSegment,
  onChangeLocation,
  ...props
}: UpdateSegmentFormInnerProps) => {
  const [isDirty, setIsDirty] = useState(false);

  const handleSubmit = useCallback(
    async (segment: any) => {
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
        {...(props as Partial<SegmentFormProps>)}
        segment={segment.getPlainObject()}
        onIsDirtyChange={setIsDirty}
        onSubmit={handleSubmit}
        updatePreviewSummary={props.updatePreviewSummary}
      />
      <LeaveRouteConfirmModal isEnabled={isDirty} route={route} />
    </>
  );
};

const UpdateSegmentForm = _.compose(
  Segments.load({
    id: (_state: State, { params }: { params: { id: string } }) =>
      parseInt(params.id),
  }),
  Tables.load({
    id: (_state: State, { segment }: { segment?: any }) => segment?.table_id,
    fetchType: "fetchMetadataAndForeignTables",
    requestType: "fetchMetadataDeprecated",
  }),
)(UpdateSegmentFormInner);

interface CreateSegmentFormProps {
  route: PlainRoute;
  createSegment: (segment: any) => Promise<any>;
  onChangeLocation: (location: LocationDescriptor) => void;
  updatePreviewSummary: typeof updatePreviewSummary;
  [key: string]: any;
}

const CreateSegmentForm = ({
  route,
  createSegment,
  onChangeLocation,
  ...props
}: CreateSegmentFormProps) => {
  const [isDirty, setIsDirty] = useState(false);

  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [, scheduleCallback] = useCallbackEffect();

  const handleSubmit = useCallback(
    (segment: any) => {
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
        {...(props as Partial<SegmentFormProps>)}
        onIsDirtyChange={setIsDirty}
        onSubmit={handleSubmit}
        updatePreviewSummary={props.updatePreviewSummary}
      />
      <LeaveRouteConfirmModal isEnabled={isDirty} route={route} />
    </>
  );
};

interface SegmentAppInnerProps {
  params: { id?: string };
  [key: string]: any;
}

const SegmentAppInner = (props: SegmentAppInnerProps) => {
  if (props.params.id) {
    return <UpdateSegmentForm {...props} />;
  }

  return <CreateSegmentForm {...props} />;
};

export const SegmentApp = connect(
  mapStateToProps,
  mapDispatchToProps,
)(SegmentAppInner);
