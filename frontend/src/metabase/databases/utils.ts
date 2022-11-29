import * as Yup from "yup";
import type { TestContext } from "yup";
import * as Errors from "metabase/core/utils/errors";
import { Engine, EngineField } from "metabase-types/api";
import { DatabaseValues } from "./types";

export const getValidationSchema = (engine?: Engine, engineName?: string) => {
  const fields = engine?.["details-fields"] ?? [];
  const entries = fields.map(field => [field.name, getFieldSchema(field)]);

  return Yup.object({
    engine: Yup.string().default(engineName).required(Errors.required),
    name: Yup.string().nullable().default(null).required(Errors.required),
    details: Yup.object(Object.fromEntries(entries)),
  });
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

export const getVisibleFields = (engine: Engine, values: DatabaseValues) => {
  const fields = engine["details-fields"] ?? [];
  return fields.filter(field => isFieldVisible(field, values.details));
};
