import * as Yup from "yup";

import * as Errors from "metabase/lib/errors";
import { slugify } from "metabase/lib/formatting/url";
import type {
  CreateTransformRequest,
  TransformSource,
} from "metabase-types/api";

import {
  VALIDATION_SCHEMA as INCREMENTAL_TRANSFORM_VALIDATION_SCHEMA,
  buildIncrementalSource,
  buildIncrementalTarget,
  getInitialValues as incrementalTransformGetInitialValues,
} from "../../../components/IncrementalTransform";

export const VALIDATION_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  targetName: Yup.string().required(Errors.required),
  // Databases that support schemas (Postgres, Snowflake, SQL Server, etc.) require a non-blank
  // targetSchema; databases that don't (MySQL, MariaDB, SQLite) allow null. The value of
  // `$supportsSchemas` is threaded in via `FormProvider`'s `validationContext` — see
  // GDGT-2144 and the LoginForm pattern for other usages of `.when("$ctxKey", ...)`.
  targetSchema: Yup.string()
    .nullable()
    .defined()
    .when("$supportsSchemas", {
      is: true,
      then: (schema) => schema.required(Errors.required),
    }),
  collection_id: Yup.number().nullable().defined(),
}).concat(INCREMENTAL_TRANSFORM_VALIDATION_SCHEMA);

export type NewTransformValues = Yup.InferType<typeof VALIDATION_SCHEMA>;

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
  collection_id: null,
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
    collection_id: values.collection_id,
  };
};
