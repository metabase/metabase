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
