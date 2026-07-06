import * as Yup from "yup";

import * as Errors from "metabase/utils/errors";
import type {
  IndexColumn,
  IndexField,
  IndexKind,
  StructuredIndex,
} from "metabase-types/api";

export type IndexFormValues = Record<string, unknown>;

function defaultFieldValue(field: IndexField) {
  switch (field.type) {
    case "boolean":
      return false;
    case "columns":
      return [];
    case "integer":
      return null;
    case "select":
      return field.options?.[0]?.value ?? "";
    default:
      return "";
  }
}

export function buildInitialValues(
  fields: IndexField[],
  structured?: StructuredIndex,
): IndexFormValues {
  const source: IndexFormValues | undefined = structured;
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      source?.[field.name] ?? defaultFieldValue(field),
    ]),
  );
}

function getFieldSchema(field: IndexField): Yup.AnySchema {
  switch (field.type) {
    case "columns": {
      const schema = Yup.array().of(
        Yup.object({
          name: Yup.string().required(),
          direction: Yup.string().oneOf(["asc", "desc"]).optional(),
        }),
      );
      return field.required ? schema.min(1, Errors.required) : schema;
    }
    case "boolean":
      return Yup.boolean();
    case "integer": {
      const schema = Yup.number().nullable();
      return field.required ? schema.required(Errors.required) : schema;
    }
    default: {
      const schema = Yup.string();
      return field.required ? schema.required(Errors.required) : schema;
    }
  }
}

export function buildValidationSchema(fields: IndexField[]) {
  return Yup.object(
    Object.fromEntries(
      fields.map((field) => [field.name, getFieldSchema(field)]),
    ),
  );
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

export function toStructured(
  kind: IndexKind,
  fields: IndexField[],
  values: IndexFormValues,
): StructuredIndex {
  const structured: Record<string, unknown> = { kind };
  for (const field of fields) {
    const value = values[field.name];
    if (field.type === "columns") {
      const columns = (value as IndexColumn[] | undefined) ?? [];
      // Omit an empty columns key: the schema rejects [] (e.g. an ALL/EVEN distkey takes none).
      if (columns.length > 0) {
        structured[field.name] = field.directions
          ? columns.map((column) => ({
              name: column.name,
              direction: column.direction ?? "asc",
            }))
          : columns.map((column) => ({ name: column.name }));
      }
    } else if (!isBlank(value)) {
      // Omit blank optional fields; the schema rejects present-but-null. Real 0/false are kept.
      structured[field.name] = value;
    }
  }
  return structured as StructuredIndex;
}
