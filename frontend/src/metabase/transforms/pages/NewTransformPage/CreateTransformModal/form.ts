import { t } from "ttag";
import * as Yup from "yup";

import * as Errors from "metabase/utils/errors";
import { slugify } from "metabase/visualizations/lib/formatting/url";
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
import { isIngestionSource, isValidSecretName } from "../../../utils";

const SECRET_SCHEMA = Yup.object({
  name: Yup.string().default("").defined(),
  value: Yup.string().default("").defined(),
});

export type NewTransformSecret = Yup.InferType<typeof SECRET_SCHEMA>;

/** Half-filled rows are dropped on submit, so they must not block validation. */
const isFilledSecret = ({ name, value }: NewTransformSecret) =>
  name.trim() !== "" && value !== "";

export const VALIDATION_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
  targetName: Yup.string().required(Errors.required),
  // `$supportsSchemas` is threaded in via `FormProvider`'s `validationContext`; see `LoginForm.tsx`.
  targetSchema: Yup.string()
    .nullable()
    .defined()
    .when("$supportsSchemas", {
      is: true,
      then: (schema) => schema.required(Errors.required),
    }),
  collection_id: Yup.number().nullable().defined(),
  secrets: Yup.array()
    .of(SECRET_SCHEMA)
    .default([])
    .defined()
    .test(
      "secret-names",
      () => t`Check the names of your secrets.`,
      (secrets: NewTransformSecret[] = []) =>
        secrets.every(
          (secret) =>
            !isFilledSecret(secret) || isValidSecretName(secret.name.trim()),
        ),
    ),
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
  secrets: [],
  ...incrementalTransformGetInitialValues(defaultValues),
});

const buildSecrets = (
  source: TransformSource,
  secrets: NewTransformSecret[],
): Record<string, string> | undefined => {
  if (!isIngestionSource(source)) {
    return undefined;
  }

  const filledSecrets = secrets.filter(isFilledSecret);
  if (filledSecrets.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    filledSecrets.map(({ name, value }) => [name.trim(), value]),
  );
};

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

  const secrets = buildSecrets(source, values.secrets);

  return {
    name: values.name,
    source: transformSource,
    target: transformTarget,
    collection_id: values.collection_id,
    ...(secrets != null ? { secrets } : {}),
  };
};
