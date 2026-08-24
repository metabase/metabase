import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  useCreateSegmentMutation,
  useGetSegmentQuery,
  useUpdateSegmentMutation,
} from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { trackSegmentCreated } from "metabase/common/data-studio/analytics";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useNavigate, useParams } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import type { Segment } from "metabase-types/api";

import { SegmentForm } from "../components/SegmentForm";

type SegmentAppParams = {
  id: string;
};

type UpdateSegmentFormProps = {
  segmentId: number;
};

function UpdateSegmentForm({ segmentId }: UpdateSegmentFormProps) {
  const navigate = useNavigate();
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

      const result = await updateSegment({
        id: segmentId,
        ...segmentValues,
        revision_message: segmentValues.revision_message ?? "",
      });
      if (result.error) {
        setIsDirty(isDirty);
        return;
      }
      navigate("/admin/datamodel/segments");
    },
    [segmentId, updateSegment, isDirty, navigate],
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

      <LeaveRouteConfirmModal isEnabled={isDirty} />
    </>
  );
}

function CreateSegmentForm() {
  const navigate = useNavigate();
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
        const result = await createSegment({
          name: checkNotNull(segment.name),
          definition: checkNotNull(segment.definition),
          description: segment.description,
        });
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
        navigate("/admin/datamodel/segments");
      });
    },
    [scheduleCallback, createSegment, navigate, sendErrorToast, isDirty],
  );

  return (
    <>
      <SegmentForm onIsDirtyChange={setIsDirty} onSubmit={handleSubmit} />

      <LeaveRouteConfirmModal isEnabled={isDirty} />
    </>
  );
}

export function SegmentApp() {
  const params = useParams<SegmentAppParams>();

  if (params.id) {
    return <UpdateSegmentForm segmentId={parseInt(params.id, 10)} />;
  }

  return <CreateSegmentForm />;
}
