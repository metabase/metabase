// Shared types for the legacy reference module.
// These permissive shapes match the loosely-typed redux state and props
// flowing through this module's connected components.

import type {
  DatabaseId,
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
