import type { SdkQuestionId } from "embedding-sdk-bundle/types/question";
import * as Urls from "metabase/urls";

/**
 * Derives the questionId from URL slug and deserialized card.
 * Returns "new-native" for hash-encoded native cards (e.g. Metabot SQL editor navigation),
 * a numeric/string ID for saved questions, or null for new notebook questions.
 */
export function resolveQuestionId(
  slug: string | undefined,
  deserializedCard: { dataset_query?: { type?: string } } | undefined,
): SdkQuestionId | null {
  const extractedId = Urls.extractEntityId(slug) ?? null;
  if (extractedId !== null) {
    return extractedId;
  }
  if (deserializedCard?.dataset_query?.type === "native") {
    return "new-native";
  }
  return null;
}
