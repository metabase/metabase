import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import {
  type IncrementalSettingsFormValues,
  convertTransformFormToUpdateRequest,
  getIncrementalSettingsFromTransform,
  getValidationSchema,
} from "./form";

export const useUpdateIncrementalSettings = (transform: Transform) => {
  const [sendToast] = useToast();
  const [updateTransform] = useUpdateTransformMutation();
  const initialValues = useMemo(
    () => getIncrementalSettingsFromTransform(transform),
    [transform],
  );
  const validationSchema = useMemo(() => getValidationSchema(), []);

  const update = useCallback(
    async (values: IncrementalSettingsFormValues) => {
      const requestData = convertTransformFormToUpdateRequest(
        transform,
        values,
      );
      try {
        return await updateTransform(requestData).unwrap();
      } catch (error) {
        sendToast({
          message: getErrorMessage(error, t`Failed to update transform`),
          icon: "warning",
        });
        throw error;
      }
    },
    [updateTransform, transform, sendToast],
  );

  return {
    initialValues,
    validationSchema,
    update,
  };
};
