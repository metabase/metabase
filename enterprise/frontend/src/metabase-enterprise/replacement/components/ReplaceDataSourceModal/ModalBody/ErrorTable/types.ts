import type { ReplaceSourceError } from "metabase-types/api";

export type ReplaceSourceErrorItem = ReplaceSourceError & {
  id: string;
};
