import * as Yup from "yup";

import * as Errors from "metabase/utils/errors";
import type {
  IndexColumn,
  IndexColumnDirection,
  IndexField,
  IndexFieldValue,
  StructuredIndexRequest,
} from "metabase-types/api";

// Form values are keyed by each field descriptor's `name`. The index kind is
// tracked outside the form (a picker on create, fixed on edit), so it isn't a
// member here.
export type IndexFormValues = Record<string, IndexFieldValue>;

// The descriptor `name` of the index-name field (driver.common/index-name-field).
// Editing it would mean dropping and recreating the index, so it's locked on edit.
export const INDEX_NAME_FIELD_NAME = "name";

const COLUMN_DIRECTIONS: IndexColumnDirection[] = ["asc", "desc"];

function isColumnDirection(value: unknown): value is IndexColumnDirection {
  return COLUMN_DIRECTIONS.some((direction) => direction === value);
}

function parseColumn(raw: unknown): IndexColumn | null {
  if (raw == null || typeof raw !== "object" || !("name" in raw)) {
    return null;
  }
  const { name } = raw;
  if (typeof name !== "string") {
    return null;
  }
  const direction = "direction" in raw ? raw.direction : undefined;
  return isColumnDirection(direction) ? { name, direction } : { name };
}

function parseColumns(raw: unknown): IndexColumn[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    const column = parseColumn(item);
    return column ? [column] : [];
  });
}

function getInitialFieldValue(
  field: IndexField,
  raw: unknown,
): IndexFieldValue {
  switch (field.type) {
    case "boolean":
      return typeof raw === "boolean" ? raw : false;
    case "integer":
      return typeof raw === "number" ? raw : "";
    case "select":
      return typeof raw === "string" ? raw : (field.options?.[0]?.value ?? "");
    case "columns":
      return parseColumns(raw);
    case "string":
      return typeof raw === "string" ? raw : "";
  }
}

// Build form values for a method's fields, seeding from an existing structured
// request when editing.
export function getIndexFormInitialValues(
  fields: IndexField[],
  structured?: Record<string, unknown>,
): IndexFormValues {
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      getInitialFieldValue(field, structured?.[field.name]),
    ]),
  );
}

function getFieldSchema(field: IndexField): Yup.AnySchema {
  switch (field.type) {
    case "boolean":
      return Yup.boolean();
    case "integer": {
      const schema = Yup.number().transform((value, original) =>
        original === "" ? undefined : value,
      );
      return field.required ? schema.required(Errors.required) : schema;
    }
    case "columns": {
      const schema = Yup.array();
      return field.required ? schema.min(1, Errors.required) : schema;
    }
    case "select":
    case "string": {
      const schema = Yup.string();
      return field.required ? schema.required(Errors.required) : schema;
    }
  }
}

export function buildIndexValidationSchema(
  fields: IndexField[],
): Yup.AnyObjectSchema {
  return Yup.object().shape(
    Object.fromEntries(
      fields.map((field) => [field.name, getFieldSchema(field)]),
    ),
  );
}

// Optional fields left empty are omitted so the request body stays clean and
// the backend falls back to its defaults.
function isEmptyOptionalValue(
  field: IndexField,
  value: IndexFieldValue,
): boolean {
  if (field.required) {
    return false;
  }
  switch (field.type) {
    case "columns":
      return Array.isArray(value) && value.length === 0;
    case "integer":
    case "select":
    case "string":
      return value === "";
    case "boolean":
      return false;
  }
}

// Assemble the structured request body from the kind and the collected field
// values. Field names map directly to keys in the kind's structured branch.
export function buildStructuredIndex(
  kind: string,
  fields: IndexField[],
  values: IndexFormValues,
): StructuredIndexRequest {
  const entries = fields.flatMap((field) => {
    const value = values[field.name];
    return isEmptyOptionalValue(field, value)
      ? []
      : [[field.name, value] as const];
  });
  return { kind, ...Object.fromEntries(entries) };
}
