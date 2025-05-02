import type { DictionaryArrayRow } from "metabase/i18n/types";

/** Translations retrieved from the BE have ids */
export type RetrievedDictionaryArrayRow = DictionaryArrayRow & { id: number };

export type DictionaryResponse = {
  data: RetrievedDictionaryArrayRow[];
};
