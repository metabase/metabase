import { t } from "ttag";

import {
  useCreateMeasureMutation,
  useUpdateMeasureMutation,
} from "metabase/api";
import { trackMeasureCreated } from "metabase/common/data-studio/analytics";
import { useMetadataToasts } from "metabase/common/hooks";
import * as Lib from "metabase-lib";
import type { Measure } from "metabase-types/api";

import type { ItemDraft } from "../InlineItemEditor";

/**
 * PROTOTYPE: saves a measure list's inline rows, as new measures or over
 * saved ones. Each resolves to what was saved, or `null` when saving failed.
 */
export function useInlineMeasureSaves() {
  const [createMeasure] = useCreateMeasureMutation();
  const [updateMeasure] = useUpdateMeasureMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  /** An unnamed measure takes `fallbackName` */
  const create = async (
    { name, query }: ItemDraft,
    {
      fallbackName,
      description,
    }: { fallbackName: string; description?: string },
  ): Promise<ItemDraft | null> => {
    const savedName = name.trim() || fallbackName;
    const { data: measure, error } = await createMeasure({
      name: savedName,
      definition: Lib.toJsQuery(query),
      description,
    });
    if (error || !measure) {
      trackMeasureCreated("failure");
      sendErrorToast(t`Failed to create measure`);
      return null;
    }
    trackMeasureCreated("success", measure.id);
    sendSuccessToast(t`Measure created`);
    return { name: savedName, query };
  };

  /** Clearing the name keeps the one it had */
  const update = async (
    measure: Measure,
    { name, query }: ItemDraft,
  ): Promise<ItemDraft | null> => {
    const savedName = name.trim() || measure.name;
    const { error } = await updateMeasure({
      id: measure.id,
      name: savedName,
      definition: Lib.toJsQuery(query),
      revision_message: t`Updated from Data Studio`,
    });
    if (error) {
      sendErrorToast(t`Failed to update measure`);
      return null;
    }
    sendSuccessToast(t`Measure updated`);
    return { name: savedName, query };
  };

  return { create, update };
}
