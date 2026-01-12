import type { TestContext } from "yup";
import * as Yup from "yup";

import * as Errors from "metabase/lib/errors";
import type {
  DatabaseData,
  DatabaseFieldGroup,
  DatabaseFieldOrGroup,
  Engine,
  EngineField,
} from "metabase-types/api";

import { ADVANCED_FIELDS, FIELD_OVERRIDES } from "../constants";

const SCHEDULE_SCHEMA = Yup.object({
  schedule_type: Yup.mixed().nullable(),
  schedule_day: Yup.mixed().nullable(),
  schedule_frame: Yup.mixed().nullable(),
  schedule_hour: Yup.number().nullable(),
  schedule_minute: Yup.number().nullable(),
});

export const getValidationSchema = (
  engine: Engine | undefined,
  engineKey: string | undefined,
  isAdvanced: boolean,
) => {
  const flattenedFields = getFlattenedFields(engine?.["details-fields"] ?? []);
  const definedFields = filterFieldsInAdvancedMode(flattenedFields, isAdvanced);
  const fields = definedFields.filter(isDetailField);
  const entries = fields.map((field) => [field.name, getFieldSchema(field)]);

  return Yup.object({
    id: Yup.number(),
    engine: Yup.string().default(engineKey).required(Errors.required),
    name: Yup.string().default("").required(Errors.required),
    details: Yup.object(Object.fromEntries(entries)),
    schedules: Yup.object({
      metadata_sync: SCHEDULE_SCHEMA.default(undefined),
      cache_field_values: SCHEDULE_SCHEMA.nullable().default(undefined),
    }),
    auto_run_queries: Yup.boolean().nullable().default(true),
    refingerprint: Yup.boolean().nullable().default(false),
    cache_ttl: Yup.number().nullable().default(null).positive(Errors.positive),
    is_sample: Yup.boolean().default(false),
    is_full_sync: Yup.boolean().default(true),
    is_on_demand: Yup.boolean().default(false),
    "connection-string": Yup.string().default(""),
    provider_name: Yup.string().nullable().default(null),
  });
};

export const getFieldsToShow = (
  engine: Engine | undefined,
  values: DatabaseData,
  isAdvanced: boolean,
) => {
  const fields = getFlattenedFields(engine?.["details-fields"] ?? []);
  const filteredByAdvancedMode = filterFieldsInAdvancedMode(fields, isAdvanced);
  return filteredByAdvancedMode.filter((field) => {
    return isFieldVisible(field, values.details);
  });
};

export const filterFieldsInAdvancedMode = (
  fields: EngineField[],
  isAdvanced: boolean,
) => {
  return fields.filter((field) =>
    shouldShowFieldInAdvancedMode(field, isAdvanced),
  );
};

function shouldShowFieldInAdvancedMode(
  field: EngineField,
  isAdvanced: boolean,
) {
  return isAdvanced || !ADVANCED_FIELDS.includes(field.name);
}

export function getFlattenedFields(
  fields: DatabaseFieldOrGroup[],
): EngineField[] {
  return fields.reduce<EngineField[]>((acc, field) => {
    if (isDatabaseFieldGroup(field)) {
      acc.push(...field.fields);
    } else {
      acc.push(field);
    }
    return acc;
  }, []);
}

export const getSubmitValues = (
  engine: Engine | undefined,
  values: DatabaseData,
  isAdvanced: boolean,
): DatabaseData => {
  const fields = getFieldsToShow(engine, values, isAdvanced).filter(
    isDetailField,
  );
  const entries = fields.map((field) => [
    field.name,
    values.details?.[field.name],
  ]);

  // "connection-string" is a FE only field. It's used to prefill the database form and we're not sending it to or storing it in the BE.
  const submitValues = Object.entries(values).filter(
    ([key]) => key !== "connection-string",
  );

  return {
    ...(Object.fromEntries(submitValues) as DatabaseData),
    details: Object.fromEntries(entries),
  };
};

const getFieldSchema = (field: EngineField) => {
  switch (field.type) {
    case "integer":
      return Yup.number()
        .nullable()
        .default(null)
        .test((value, context) => isFieldValid(field, value, context));
    case "hidden":
    case "boolean":
    case "section":
      return Yup.boolean()
        .nullable()
        .default(field.default != null ? Boolean(field.default) : false)
        .test((value, context) => isFieldValid(field, value, context));
    case "select":
      return Yup.string()
        .nullable()
        .default(field.default != null ? String(field.default) : null)
        .test((value, context) => isFieldValid(field, value, context));
    default:
      return Yup.string()
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

export function shouldShowField(
  field: EngineField,
  isAdvanced: boolean,
  details?: Record<string, unknown>,
) {
  return (
    isFieldVisible(field, details) &&
    shouldShowFieldInAdvancedMode(field, isAdvanced)
  );
}

export function setDatabaseFormValues(
  previousValues: DatabaseData,
  newValues: DatabaseData,
) {
  return {
    ...previousValues,
    ...newValues,
    details: {
      ...previousValues.details,
      ...newValues.details,
    },
  };
}

export function isDatabaseFieldGroup(
  field: DatabaseFieldOrGroup,
): field is DatabaseFieldGroup {
  return (
    typeof field === "object" &&
    field !== null &&
    "type" in field &&
    field.type === "group"
  );
}
