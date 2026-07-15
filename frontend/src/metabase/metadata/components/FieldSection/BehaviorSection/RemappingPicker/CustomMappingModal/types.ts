import type { RowValue } from "metabase-types/api";

// Editor seed: raw field values mapped to their labels; a label is unset until filled by
// fillMissingMappings (undefined, or null in values stored by legacy/serdes data).
export type DraftMapping = Map<RowValue, string | null | undefined>;

// Saved mapping: every value has a label.
export type Mapping = Map<RowValue, string>;

export interface ChangeOptions {
  isAutomatic?: boolean;
}
