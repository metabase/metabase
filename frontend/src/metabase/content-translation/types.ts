import type { Card, DatasetData } from "metabase-types/api";

export type NonEmpty<ArrayType> = ArrayType extends (infer ItemType)[]
  ? [ItemType, ...ItemType[]]
  : never;

export type ContentTranslationFunction = <T = string | null | undefined>(
  msgid: T,
) => string | T;

type PartialNullable<T> = {
  [K in keyof T]?: T[K] | null;
};

export type TranslatableSingleSeries = {
  card: PartialNullable<
    Pick<Card, "name" | "display" | "visualization_settings">
  >;
  data?: DatasetData;
};
