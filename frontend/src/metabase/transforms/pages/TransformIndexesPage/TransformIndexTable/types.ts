import type { TableIndexEntry } from "metabase-types/api";

export type IndexRow = TableIndexEntry & {
  id: string;
  /** Resolved display name of the user in `request.created_by`, or "" if unknown. */
  modifiedBy: string;
};
