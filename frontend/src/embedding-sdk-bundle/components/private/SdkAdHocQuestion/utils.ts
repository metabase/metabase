import type { SdkQuestionId } from "embedding-sdk-bundle/types/question";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

function isNativeOnlyQuestion(question: Question): boolean {
  try {
    const query = question.query();
    return Lib.queryDisplayInfo(query).isNative && Lib.stageCount(query) === 1;
  } catch {
    // A card that cannot be read as a query is left for the question loader to report.
    return false;
  }
}

/**
 * Derives the questionId from URL slug and the question built from a deserialized card.
 * Returns "new-native" for hash-encoded native cards (e.g. Metabot SQL editor navigation),
 * a numeric/string ID for saved questions, or null for new notebook questions.
 */
export function resolveQuestionId(
  slug: string | undefined,
  deserializedQuestion: Question | undefined,
): SdkQuestionId | null {
  const extractedId = Urls.extractEntityId(slug) ?? null;
  if (extractedId !== null) {
    return extractedId;
  }
  if (deserializedQuestion && isNativeOnlyQuestion(deserializedQuestion)) {
    return "new-native";
  }
  return null;
}
