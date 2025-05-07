export type NonEmpty<ArrayType> = ArrayType extends (infer ItemType)[]
  ? [ItemType, ...ItemType[]]
  : never;

export type ContentTranslationFunction = <T>(msgid: T) => string | T;
