import * as Yup from "yup";

import * as Errors from "metabase/utils/errors";
import type {
  IndexColumn,
  IndexField,
  IndexKind,
  StructuredIndex,
} from "metabase-types/api";

export type IndexFieldValue = string | number | boolean | IndexColumn[] | null;

export type IndexFormValues = Record<string, IndexFieldValue>;

function defaultFieldValue(field: IndexField): IndexFieldValue {
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
  carriedValues?: IndexFormValues,
): IndexFormValues {
  // Unjustified type cast. FIXME
  const source = structured as Record<string, IndexFieldValue> | undefined;
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      carriedValues?.[field.name] ??
        source?.[field.name] ??
        defaultFieldValue(field),
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

export function toStructured(
  kind: IndexKind,
  fields: IndexField[],
  values: IndexFormValues,
): StructuredIndex {
  const structured: Record<string, IndexFieldValue> = { kind };
  for (const field of fields) {
    const value = values[field.name];
    if (field.type === "columns" && Array.isArray(value)) {
      // Omit an optional column list left empty (e.g. a Redshift DISTSTYLE ALL/EVEN distkey): the backend
      // rejects [] but accepts the key being absent.
      if (!field.required && value.length === 0) {
        continue;
      }
      structured[field.name] = field.directions
        ? value.map((column) => ({
            name: column.name,
            direction: column.direction ?? "asc",
          }))
        : value.map((column) => ({ name: column.name }));
    } else {
      // Omit an optional scalar left blank -- null (e.g. a ClickHouse skip-index granularity) or "" (a blank
      // string or empty-option select): the backend rejects those but accepts the key being absent.
      if (!field.required && (value == null || value === "")) {
        continue;
      }
      structured[field.name] = value;
    }
  }
  // Unjustified type cast. FIXME
  return structured as StructuredIndex;
}
