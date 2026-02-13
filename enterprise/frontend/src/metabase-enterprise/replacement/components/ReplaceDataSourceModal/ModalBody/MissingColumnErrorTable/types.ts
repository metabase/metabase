import type { MissingColumnReplaceSourceError } from "metabase-types/api";

export type MissingColumnReplaceSourceErrorItem =
  MissingColumnReplaceSourceError & {
    id: string;
  };
