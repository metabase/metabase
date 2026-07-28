import { resolveCardProp } from "embedding-sdk-bundle/lib/sdk-question/resolve-card-prop";
import { getCardFromSdkQuestionQuery } from "embedding-sdk-bundle/lib/sdk-question-query";
import type { UnsavedCard } from "metabase-types/api";

export function resolveDeserializedCard({
  card,
  query,
}: {
  card?: Parameters<typeof resolveCardProp>[0];
  query?: Parameters<typeof getCardFromSdkQuestionQuery>[0];
}): UnsavedCard | undefined {
  if (card != null) {
    return resolveCardProp(card) ?? undefined;
  }
  return getCardFromSdkQuestionQuery(query);
}
