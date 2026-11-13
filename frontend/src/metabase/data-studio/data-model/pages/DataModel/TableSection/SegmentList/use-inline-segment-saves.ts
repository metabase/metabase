import { t } from "ttag";

import {
  useCreateSegmentMutation,
  useUpdateSegmentMutation,
} from "metabase/api";
import { trackSegmentCreated } from "metabase/common/data-studio/analytics";
import { useMetadataToasts } from "metabase/common/hooks";
import * as Lib from "metabase-lib";
import type { Segment } from "metabase-types/api";

import type { ItemDraft } from "../InlineItemEditor";

/**
 * PROTOTYPE: saves a segment list's inline rows, as new segments or over
 * saved ones. Each resolves to what was saved, or `null` when saving failed.
 */
export function useInlineSegmentSaves() {
  const [createSegment] = useCreateSegmentMutation();
  const [updateSegment] = useUpdateSegmentMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  /** An unnamed segment takes `fallbackName` */
  const create = async (
    { name, query }: ItemDraft,
    {
      fallbackName,
      description,
    }: { fallbackName: string; description?: string },
  ): Promise<ItemDraft | null> => {
    const savedName = name.trim() || fallbackName;
    const { data: segment, error } = await createSegment({
      name: savedName,
      definition: Lib.toJsQuery(query),
      description,
    });
    if (error || !segment) {
      trackSegmentCreated("failure", "data_studio_segments");
      sendErrorToast(t`Failed to create segment`);
      return null;
    }
    trackSegmentCreated("success", "data_studio_segments", segment.id);
    sendSuccessToast(t`Segment created`);
    return { name: savedName, query };
  };

  /** Clearing the name keeps the one it had */
  const update = async (
    segment: Segment,
    { name, query }: ItemDraft,
  ): Promise<ItemDraft | null> => {
    const savedName = name.trim() || segment.name;
    const { error } = await updateSegment({
      id: segment.id,
      name: savedName,
      definition: Lib.toJsQuery(query),
      revision_message: t`Updated from Data Studio`,
    });
    if (error) {
      sendErrorToast(t`Failed to update segment`);
      return null;
    }
    sendSuccessToast(t`Segment updated`);
    return { name: savedName, query };
  };

  return { create, update };
}
