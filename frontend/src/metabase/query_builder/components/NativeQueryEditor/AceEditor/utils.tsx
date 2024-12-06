import { t } from "ttag";

import type { CardType } from "metabase-types/api";

export const getAutocompleteResultMeta = (
  type: CardType,
  collectionName: string,
) => {
  if (type === "question") {
    return t`Question in ${collectionName}`;
  }

  if (type === "model") {
    return t`Model in ${collectionName}`;
  }

  if (type === "metric") {
    return t`Metric in ${collectionName}`;
  }

  throw new Error(`Unknown question.type(): ${type}`);
};
