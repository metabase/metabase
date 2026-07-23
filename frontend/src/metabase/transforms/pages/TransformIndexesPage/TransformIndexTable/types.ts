import type { TableIndexEntry } from "metabase-types/api";

type IndexRowId = string;

export type IndexRow = TableIndexEntry & {
  id: IndexRowId;
  modifiedBy: string;
};
