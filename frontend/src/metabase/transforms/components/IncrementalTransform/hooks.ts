import { useMemo } from "react";

import { useUpdateTransformMutation } from "metabase/api";
import type { Transform } from "metabase-types/api";

import {
  type IncrementalSettingsFormValues,
  VALIDATION_SCHEMA,
  convertTransformFormToUpdateRequest,
  getIncrementalSettingsFromTransform,
} from "./form";

export const useUpdateIncrementalSettings = (transform: Transform) => {
  const [updateTransform] = useUpdateTransformMutation();
  const initialValues = useMemo(
    () => getIncrementalSettingsFromTransform(transform),
    [transform],
  );

  const updateIncrementalSettings = async (
    values: IncrementalSettingsFormValues,
  ) => {
    const requestData = convertTransformFormToUpdateRequest(transform, values);
    return await updateTransform(requestData).unwrap();
  };

  return {
    initialValues,
    validationSchema: VALIDATION_SCHEMA,
    updateIncrementalSettings,
  };
};
