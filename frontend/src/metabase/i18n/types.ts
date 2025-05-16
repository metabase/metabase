export type NonEmpty<ArrayType> = ArrayType extends (infer ItemType)[]
  ? [ItemType, ...ItemType[]]
  : never;

export type ContentTranslationFunction = <T = string | null | undefined>(
  msgid: T,
) => string | T;
