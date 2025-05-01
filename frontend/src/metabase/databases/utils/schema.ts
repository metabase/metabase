import type { TestContext } from "yup";
import { boolean, mixed, number, object, string } from "yup";

import * as Errors from "metabase/lib/errors";
import type { DatabaseData, Engine, EngineField } from "metabase-types/api";

import { ADVANCED_FIELDS, FIELD_OVERRIDES } from "../constants";

const SCHEDULE_SCHEMA = object({
  schedule_type: mixed().nullable(),
  schedule_day: mixed().nullable(),
  schedule_frame: mixed().nullable(),
  schedule_hour: number().nullable(),
  schedule_minute: number().nullable(),
});

export const getValidationSchema = (
  engine: Engine | undefined,
  engineKey: string | undefined,
  isAdvanced: boolean,
) => {
  const fields = getDefinedFields(engine, isAdvanced).filter(isDetailField);
  const entries = fields.map((field) => [field.name, getFieldSchema(field)]);

  return object({
    id: number(),
    engine: string().default(engineKey).required(Errors.required),
    name: string().default("").required(Errors.required),
    details: object(Object.fromEntries(entries)),
    schedules: object({
      metadata_sync: SCHEDULE_SCHEMA.default(undefined),
      cache_field_values: SCHEDULE_SCHEMA.nullable().default(undefined),
    }),
    auto_run_queries: boolean().nullable().default(true),
    refingerprint: boolean().nullable().default(false),
    cache_ttl: number().nullable().default(null).positive(Errors.positive),
    is_sample: boolean().default(false),
    is_full_sync: boolean().default(true),
    is_on_demand: boolean().default(false),
  });
};

export const getVisibleFields = (
  engine: Engine | undefined,
  values: DatabaseData,
  isAdvanced: boolean,
) => {
  const fields = getDefinedFields(engine, isAdvanced);
  return fields.filter((field) => isFieldVisible(field, values.details));
};

export const getDefinedFields = (
  engine: Engine | undefined,
  isAdvanced: boolean,
) => {
  const fields = engine?.["details-fields"] ?? [];

  return isAdvanced
    ? fields
    : fields.filter((field) => !ADVANCED_FIELDS.includes(field.name));
};

export const getSubmitValues = (
  engine: Engine | undefined,
  values: DatabaseData,
  isAdvanced: boolean,
) => {
  const fields = getVisibleFields(engine, values, isAdvanced);
  const entries = fields
    .filter((field) => isDetailField(field))
    .filter((field) => isFieldVisible(field, values.details))
    .map((field) => [field.name, values.details?.[field.name]]);

  return {
    ...values,
    details: Object.fromEntries(entries),
  };
};

const getFieldSchema = (field: EngineField) => {
  switch (field.type) {
    case "integer":
      return number()
        .nullable()
        .default(null)
        .test((value, context) => isFieldValid(field, value, context));
    case "hidden":
    case "boolean":
    case "section":
      return boolean()
        .nullable()
        .default(field.default != null ? Boolean(field.default) : false)
        .test((value, context) => isFieldValid(field, value, context));
    case "select":
      return string()
        .nullable()
        .default(field.default != null ? String(field.default) : null)
        .test((value, context) => isFieldValid(field, value, context));
    default:
      return string()
        .nullable()
        .default(null)
        .test((value, context) => isFieldValid(field, value, context));
  }
};

const isDetailField = (field: EngineField) => {
  const override = FIELD_OVERRIDES[field.name];
  return override?.name == null;
};

const isFieldValid = (
  field: EngineField,
  value: unknown,
  context: TestContext,
) => {
  const isEmpty = value == null || value === "";
  const isVisible = isFieldVisible(field, context.parent);

  if (field.required && isEmpty && isVisible) {
    return context.createError({ message: Errors.required });
  } else {
    return true;
  }
};

const isFieldVisible = (
  field: EngineField,
  details?: Record<string, unknown>,
) => {
  const rules = field["visible-if"] ?? {};

  return Object.entries(rules).every(([name, value]) =>
    Array.isArray(value)
      ? value.includes(details?.[name])
      : value === details?.[name],
  );
};
