export type DictionaryArrayRow = {
  locale: string;
  msgid: string;
  msgstr: string;
};

export type DictionaryArray = DictionaryArrayRow[];

export type NonEmpty<ArrayType> = ArrayType extends (infer ItemType)[]
  ? [ItemType, ...ItemType[]]
  : never;

// Translations retrieved from the BE have ids
export type RetrievedDictionaryArrayRow = DictionaryArrayRow & { id: number };

export type ContentTranslationFunction = {
  <T>(msgid: T, retrieveMapping: true): Record<string, string>;
  <T>(msgid: T, retrieveMapping?: false): T;
};

export type DictionaryResponse = {
  data: RetrievedDictionaryArrayRow[];
};
