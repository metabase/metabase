import type { RowValue } from "metabase-types/api";

// Editor seed: labels are unset until filled by fillMissingMappings.
export type DraftMapping = Map<RowValue, string | undefined>;

export type Mapping = Map<RowValue, string>;

export interface ChangeOptions {
  isAutomatic?: boolean;
}
