import * as Yup from "yup";

import * as Errors from "metabase/lib/errors";
import { slugify } from "metabase/lib/formatting/url";
import {
  buildIncrementalSource,
  buildIncrementalTarget,
  getInitialValues as incrementalTransformGetInitialValues,
  getValidationSchema as incrementalTransformGetValidationSchema,
} from "metabase-enterprise/transforms/components/IncrementalTransform";
import type {
  CreateTransformRequest,
  TransformSource,
} from "metabase-types/api";

export type NewTransformValues = Yup.InferType<
  ReturnType<typeof getValidationSchema>
>;

export const getValidationSchema = () =>
  Yup.object({
    name: Yup.string().required(Errors.required),
    targetName: Yup.string().required(Errors.required),
    targetSchema: Yup.string().nullable().defined(),
  }).concat(incrementalTransformGetValidationSchema());

export const getInitialValues = (
  schemas: string[],
  defaultValues: Partial<NewTransformValues>,
): NewTransformValues => ({
  ...defaultValues,
  name: "",
  targetSchema: schemas?.[0] || null,
  targetName: defaultValues.targetName
    ? defaultValues.targetName
    : defaultValues.name
      ? slugify(defaultValues.name)
      : "",
  ...incrementalTransformGetInitialValues(defaultValues),
});

export const convertTransformFormToCreateRequest = (
  source: TransformSource,
  values: NewTransformValues,
  databaseId: number,
): CreateTransformRequest => {
  const transformSource = buildIncrementalSource(source, values);
  const transformTarget = buildIncrementalTarget(
    {
      name: values.targetName,
      schema: values.targetSchema,
      database: databaseId,
    },
    values,
  );

  return {
    name: values.name,
    source: transformSource,
    target: transformTarget,
  };
};
