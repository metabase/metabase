import { useMemo } from "react";

import { useLazyGetFieldQuery, useUpdateTransformMutation } from "metabase/api";
import type { Transform } from "metabase-types/api";

import {
  type IncrementalSettingsFormValues,
  VALIDATION_SCHEMA,
  convertTransformFormToUpdateRequest,
  fieldSupportsLookback,
  getIncrementalSettingsFromTransform,
} from "./form";

export function useUpdateIncrementalSettings(transform: Transform) {
  const [updateTransform] = useUpdateTransformMutation();
  const [fetchField] = useLazyGetFieldQuery();
  const initialValues = useMemo(
    () => getIncrementalSettingsFromTransform(transform),
    [transform],
  );

  // The inline save can fire before the newly selected checkpoint field's metadata has loaded
  // (and before LookbackField's effect clears a now-unsupported lookback), so re-check against
  // the authoritative field data before building the request. Usually a cache hit.
  const dropUnsupportedLookback = async (
    values: IncrementalSettingsFormValues,
  ): Promise<IncrementalSettingsFormValues> => {
    if (
      values.lookbackValue == null ||
      values.checkpointFilterFieldId == null
    ) {
      return values;
    }
    try {
      const field = await fetchField(
        { id: Number(values.checkpointFilterFieldId) },
        true,
      ).unwrap();
      return fieldSupportsLookback(field)
        ? values
        : { ...values, lookbackValue: null };
    } catch {
      // let the save proceed; the BE validates anyway
      return values;
    }
  };

  const updateIncrementalSettings = async (
    values: IncrementalSettingsFormValues,
  ) => {
    const requestData = convertTransformFormToUpdateRequest(
      transform,
      await dropUnsupportedLookback(values),
    );
    return await updateTransform(requestData).unwrap();
  };

  return {
    initialValues,
    validationSchema: VALIDATION_SCHEMA,
    updateIncrementalSettings,
  };
}
