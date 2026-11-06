import { t } from "ttag";

import type { Field } from "metabase-types/api";

export type EntityNoun = { one: string; other: string };

export function getEntityNoun(
  keyField?: Pick<Field, "display_name"> | null,
): EntityNoun {
  const one = keyField?.display_name ?? t`key`;
  const other = one.endsWith("s") ? one : `${one}s`;
  return { one, other };
}

export const countOf = (count: number, noun: EntityNoun) =>
  `${count.toLocaleString()} ${count === 1 ? noun.one : noun.other}`;
