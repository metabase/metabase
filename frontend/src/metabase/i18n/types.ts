/** Mapping of raw strings (sometimes called 'msgids') to translations of these
 * strings (sometimes called 'msgstrs'). This is a dictionary for a single
 * locale, so no locale information is stored in it */
export type DictionaryMap = Map<string, string>;

export type DictionaryArrayRow = {
  locale: string;
  msgid: string;
  msgstr: string;
};

export type DictionaryArray = DictionaryArrayRow[];

// Translations retrieved from the BE have ids
export type RetrievedDictionaryArrayRow = DictionaryArrayRow & { id: number };

export type ContentTranslationFunction = <T>(msgid: T) => string | T;

export type DictionaryResponse = {
  data: RetrievedDictionaryArrayRow[];
};
