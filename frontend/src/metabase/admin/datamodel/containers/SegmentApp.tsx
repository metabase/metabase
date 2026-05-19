import { useCallback, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  useCreateSegmentMutation,
  useGetSegmentQuery,
  useUpdateSegmentMutation,
} from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import { trackSegmentCreated } from "metabase/data-studio/analytics";
import { useLoadTableWithMetadata } from "metabase/data-studio/common/hooks/use-load-table-with-metadata";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import type {
  CreateSegmentRequest,
  Segment,
  UpdateSegmentRequest,
} from "metabase-types/api";

import { SegmentForm } from "../components/SegmentForm";

type SegmentAppOwnProps = {
  params: {
    id: string;
  };
  route: Route;
};

type UpdateSegmentFormProps = {
  route: Route;
  segmentId: number;
};

function UpdateSegmentForm({ route, segmentId }: UpdateSegmentFormProps) {
  const dispatch = useDispatch();
  const [isDirty, setIsDirty] = useState(false);
  const [updateSegment] = useUpdateSegmentMutation();

  const {
    data: segment,
    isLoading: isLoadingSegment,
    error: segmentError,
  } = useGetSegmentQuery(segmentId);

  const { isLoading: isLoadingTable, error: tableError } =
    useLoadTableWithMetadata(segment?.table_id, {
      includeForeignTables: true,
    });

  const handleSubmit = useCallback(
    async (segmentValues: Partial<Segment>) => {
      setIsDirty(false);

      const result = await updateSegment(
        toUpdateSegmentRequest(segmentId, segmentValues),
      );
      if (result.error) {
        setIsDirty(isDirty);
        return;
      }
      dispatch(push("/admin/datamodel/segments"));
    },
    [dispatch, segmentId, updateSegment, isDirty],
  );

  const isLoading = isLoadingSegment || isLoadingTable;
  const error = segmentError ?? tableError;

  if (isLoading || error || !segment) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <>
      <SegmentForm
        segment={segment}
        onIsDirtyChange={setIsDirty}
        onSubmit={handleSubmit}
      />

      <LeaveRouteConfirmModal isEnabled={isDirty} route={route} />
    </>
  );
}

type CreateSegmentFormProps = {
  route: Route;
};

function CreateSegmentForm({ route }: CreateSegmentFormProps) {
  const dispatch = useDispatch();
  const [isDirty, setIsDirty] = useState(false);
  const { sendErrorToast } = useMetadataToasts();
  const [createSegment] = useCreateSegmentMutation();

  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [, scheduleCallback] = useCallbackEffect();

  const handleSubmit = useCallback(
    (segment: Partial<Segment>) => {
      setIsDirty(false);

      scheduleCallback(async () => {
        const result = await createSegment(segment as CreateSegmentRequest);
        if (result.error) {
          sendErrorToast(t`Failed to create segment`);
          trackSegmentCreated("failure", "admin_datamodel_segments");
          setIsDirty(isDirty);
          console.warn(result.error);
          return;
        }
        trackSegmentCreated(
          "success",
          "admin_datamodel_segments",
          result.data?.id,
        );
        dispatch(push("/admin/datamodel/segments"));
      });
    },
    [scheduleCallback, createSegment, dispatch, sendErrorToast, isDirty],
  );

  return (
    <>
      <SegmentForm onIsDirtyChange={setIsDirty} onSubmit={handleSubmit} />

      <LeaveRouteConfirmModal isEnabled={isDirty} route={route} />
    </>
  );
}

export function SegmentApp({ params, route }: SegmentAppOwnProps) {
  if (params.id) {
    return (
      <UpdateSegmentForm route={route} segmentId={parseInt(params.id, 10)} />
    );
  }

  return <CreateSegmentForm route={route} />;
}

function toUpdateSegmentRequest(
  id: number,
  values: Partial<Segment>,
): UpdateSegmentRequest {
  return {
    id,
    name: values.name,
    description: values.description,
    definition: values.definition,
    archived: values.archived,
    revision_message: values.revision_message ?? "",
  };
}
