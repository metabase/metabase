// Editor seed: numeric/null keys, labels unset (undefined) until filled by fillMissingMappings.
export type DraftMapping = Map<number | null, string | undefined>;

// Saved mapping: every value has a label.
export type Mapping = Map<number | null, string>;

export interface ChangeOptions {
  isAutomatic?: boolean;
}
