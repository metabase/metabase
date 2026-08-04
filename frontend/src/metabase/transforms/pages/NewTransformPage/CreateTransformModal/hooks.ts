import { useMemo } from "react";

import { useCreateTransformMutation } from "metabase/api";
import { trackTransformCreated } from "metabase/transforms/analytics";
import type {
  CollectionId,
  Transform,
  TransformSource,
} from "metabase-types/api";

import {
  type NewTransformValues,
  VALIDATION_SCHEMA,
  convertTransformFormToCreateRequest,
  getInitialValues,
} from "./form";

export const useCreateTransform = (
  schemas: string[],
  defaultValues: Partial<NewTransformValues>,
  rootCollectionId: CollectionId,
) => {
  const [createTransformMutation] = useCreateTransformMutation();
  const initialValues: NewTransformValues = useMemo(
    () => getInitialValues(schemas, defaultValues, rootCollectionId),
    [schemas, defaultValues, rootCollectionId],
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
    const transform = await createTransformMutation({
      ...request,
      collection_id: request.collection_id ?? rootCollectionId,
    }).unwrap();
    trackTransformCreated({
      transformId: transform.id,
      isIncremental: transform.target.type === "table-incremental",
    });
    return transform;
  };

  return {
    initialValues,
    validationSchema: VALIDATION_SCHEMA,
    createTransform,
  };
};
