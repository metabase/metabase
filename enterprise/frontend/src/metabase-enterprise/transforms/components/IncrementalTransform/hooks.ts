import { useCallback, useMemo } from "react";

import { useUpdateTransformMutation } from "metabase-enterprise/api";
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

  const update = useCallback(
    async (values: IncrementalSettingsFormValues) => {
      const requestData = convertTransformFormToUpdateRequest(
        transform,
        values,
      );
      return await updateTransform(requestData).unwrap();
    },
    [updateTransform, transform],
  );

  return {
    initialValues,
    validationSchema: VALIDATION_SCHEMA,
    update,
  };
};
