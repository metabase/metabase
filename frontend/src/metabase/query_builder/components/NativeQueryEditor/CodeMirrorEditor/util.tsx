import { t } from "ttag";

import type { CardType } from "metabase-types/api";

import type { Location } from "../types";

export function convertIndexToPosition(value: string, index: number): Location {
  let row = 0;
  let column = 0;

  for (let idx = 0; idx < index; idx++) {
    const ch = value[idx];
    if (ch === "\n") {
      row += 1;
      column = 0;
    } else {
      column += 1;
    }
  }

  return {
    row,
    column,
  };
}

export const getCardAutocompleteResultMeta = (
  type: CardType,
  collectionName: string = t`Our analytics`,
) => {
  const collection = collectionName ?? t`Our analytics`;
  if (type === "question") {
    return t`Question in ${collection}`;
  }

  if (type === "model") {
    return t`Model in ${collection}`;
  }

  if (type === "metric") {
    return t`Metric in ${collection}`;
  }

  throw new Error(`Unknown question.type(): ${type}`);
};
