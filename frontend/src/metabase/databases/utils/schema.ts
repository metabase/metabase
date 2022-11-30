import * as Yup from "yup";
import type { TestContext } from "yup";
import * as Errors from "metabase/core/utils/errors";
import { Engine, EngineField } from "metabase-types/api";
import { ADVANCED_FIELDS, FIELD_OVERRIDES } from "../constants";
import { DatabaseValues } from "../types";

export const getValidationSchema = (
  engine: Engine | undefined,
  engineKey: string | undefined,
  isAdvanced: boolean,
) => {
  const fields = getFields(engine, isAdvanced);
  const rootSchema = getObjectSchema(fields.filter(isRootField));
  const detailsSchema = getObjectSchema(fields.filter(isDetailField));
  const schedulesSchema = getObjectSchema(fields.filter(isScheduleField));

  return Yup.object({
    engine: Yup.string().default(engineKey).required(Errors.required),
    name: Yup.string().default("").required(Errors.required),
    details: Yup.object(detailsSchema),
    schedules: Yup.object(schedulesSchema),
    ...rootSchema,
  });
};

export const getVisibleFields = (
  engine: Engine,
  values: DatabaseValues,
  isAdvanced: boolean,
) => {
  const fields = getFields(engine, isAdvanced);
  return fields.filter(field => isFieldVisible(field, values.details));
};

const getFields = (engine: Engine | undefined, isAdvanced: boolean) => {
  const fields = engine?.["details-fields"] ?? [];

  return isAdvanced
    ? fields
    : fields.filter(field => !ADVANCED_FIELDS.includes(field.name));
};

const getObjectSchema = (fields: EngineField[]) => {
  const entries = fields.map(field => [field.name, getFieldSchema(field)]);
  return Object.fromEntries(entries);
};

const getFieldSchema = (field: EngineField) => {
  switch (field.type) {
    case "integer":
      return Yup.number()
        .nullable()
        .default(field.default != null ? Number(field.default) : null)
        .test((value, context) => isFieldValid(field, value, context));
    case "boolean":
    case "section":
      return Yup.boolean()
        .defined()
        .default(field.default != null ? Boolean(field.default) : false)
        .test((value, context) => isFieldValid(field, value, context));
    default:
      return Yup.string()
        .nullable()
        .default(field.default != null ? String(field.default) : null)
        .test((value, context) => isFieldValid(field, value, context));
  }
};

const isRootField = (field: EngineField) => {
  const override = FIELD_OVERRIDES[field.name];
  return override?.name != null && !override.name.includes(".");
};

const isScheduleField = (field: EngineField) => {
  const override = FIELD_OVERRIDES[field.name];
  return override?.name != null && override.name.startsWith("schedules.");
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
