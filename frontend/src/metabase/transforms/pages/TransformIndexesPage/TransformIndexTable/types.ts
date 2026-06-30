import type { TableIndexEntry } from "metabase-types/api";

export type IndexRow = TableIndexEntry & {
  id: string;
  modifiedBy: string;
};
