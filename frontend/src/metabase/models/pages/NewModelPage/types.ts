import type { DatasetColumn } from "metabase-types/api";

export type NewModelValues = {
  name: string;
  description: string | null;
  resultMetadata: DatasetColumn[] | null;
};
