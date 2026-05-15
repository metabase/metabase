// Shared types for the legacy reference module.
// These permissive shapes match the loosely-typed redux state and props
// flowing through this module's connected components.

import type {
  DatabaseId,
  FieldFormattingSettings,
  FieldId,
  NormalizedDatabase,
  NormalizedField,
  NormalizedSegment,
  NormalizedTable,
  SegmentId,
  TableId,
} from "metabase-types/api";

// Reference selectors fall back to a `{ id }` stub when an entity hasn't been
// fetched yet; consumers handle the loading/empty states.
export type StubbedDatabase = Partial<NormalizedDatabase> & { id: DatabaseId };
export type StubbedTable = Partial<NormalizedTable> & { id: TableId };
export type StubbedSegment = Partial<NormalizedSegment> & { id: SegmentId };
export type StubbedField = Partial<NormalizedField> & {
  id: NormalizedField["id"];
};

export interface FormFieldEntry<T = unknown> {
  name: string;
  value?: T;

  onChange: (...args: any[]) => void;
}

// Common editable text fields shared by all entity Detail forms.
// Index signature allows formik to carry arbitrary extra keys and lets these
// satisfy `Record<string, unknown>` at action-handler boundaries without casts.
export interface BaseDetailFormFields {
  display_name?: string;
  name?: string;
  description?: string | null;
  points_of_interest?: string;
  caveats?: string;
  [key: string]: unknown;
}

// Field-specific editable values used by FieldDetail / SegmentFieldDetail
// directly and by FieldList / SegmentFieldList nested per-field.
export interface FieldFormFieldsValues {
  display_name?: string;
  description?: string | null;
  semantic_type?: string | null;
  fk_target_field_id?: FieldId | null;
  settings?: FieldFormattingSettings;
  [key: string]: unknown;
}
