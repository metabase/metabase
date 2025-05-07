export type DictionaryArrayRow = {
  locale: string;
  msgid: string;
  msgstr: string;
};

export type DictionaryArray = DictionaryArrayRow[];

/** Translations retrieved from the BE have ids */
export type RetrievedDictionaryArrayRow = DictionaryArrayRow & { id: number };

export type DictionaryResponse = {
  data: RetrievedDictionaryArrayRow[];
};
