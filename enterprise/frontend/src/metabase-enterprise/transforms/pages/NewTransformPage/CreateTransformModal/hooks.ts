import { useMemo } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useCreateTransformMutation } from "metabase-enterprise/api";
import { trackTransformCreated } from "metabase-enterprise/transforms/analytics";
import type { Transform, TransformSource } from "metabase-types/api";

import {
  type NewTransformValues,
  convertTransformFormToCreateRequest,
  getInitialValues,
  getValidationSchema,
} from "./form";

export const useCreateTransform = (
  schemas: string[],
  defaultValues: Partial<NewTransformValues>,
) => {
  const [sendToast] = useToast();
  const [createTransform] = useCreateTransformMutation();
  const initialValues: NewTransformValues = useMemo(
    () => getInitialValues(schemas, defaultValues),
    [schemas, defaultValues],
  );

  const validationSchema = useMemo(() => getValidationSchema(), []);

  const create = async (
    databaseId: number,
    source: TransformSource,
    values: NewTransformValues,
  ): Promise<Transform> => {
    const request = convertTransformFormToCreateRequest(
      source,
      values,
      databaseId,
    );
    try {
      const transform = await createTransform(request).unwrap();
      trackTransformCreated({ transformId: transform.id });
      return transform;
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to create transform`),
        icon: "warning",
      });
      throw error;
    }
  };

  return {
    initialValues,
    validationSchema,
    create,
  };
};
