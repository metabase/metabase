export type DictionaryArrayRow = {
  locale: string;
  msgid: string;
  msgstr: string;
};

export type DictionaryArray = DictionaryArrayRow[];

export type NonEmpty<ArrayType> = ArrayType extends (infer ItemType)[]
  ? [ItemType, ...ItemType[]]
  : never;

export type ContentTranslationFunction = <T>(msgid: T) => string | T;

/** Translations retrieved from the BE have ids */
export type RetrievedDictionaryArrayRow = DictionaryArrayRow & { id: number };

export type DictionaryResponse = {
  data: RetrievedDictionaryArrayRow[];
};
