import { useMemo } from "react";

import { useCreateTransformMutation } from "metabase-enterprise/api";
import { trackTransformCreated } from "metabase-enterprise/transforms/analytics";
import type { Transform, TransformSource } from "metabase-types/api";

import {
  type NewTransformValues,
  VALIDATION_SCHEMA,
  convertTransformFormToCreateRequest,
  getInitialValues,
} from "./form";

export const useCreateTransform = (
  schemas: string[],
  defaultValues: Partial<NewTransformValues>,
) => {
  const [createTransformMutation] = useCreateTransformMutation();
  const initialValues: NewTransformValues = useMemo(
    () => getInitialValues(schemas, defaultValues),
    [schemas, defaultValues],
  );

  const createTransform = async (
    databaseId: number,
    source: TransformSource,
    values: NewTransformValues,
  ): Promise<Transform> => {
    const request = convertTransformFormToCreateRequest(
      source,
      values,
      databaseId,
    );
    const transform = await createTransformMutation(request).unwrap();
    trackTransformCreated({ transformId: transform.id });
    return transform;
  };

  return {
    initialValues,
    validationSchema: VALIDATION_SCHEMA,
    createTransform,
  };
};
