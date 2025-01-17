import type { MetabaseQuestion } from "metabase/embedding-sdk/types/question";
import type Question from "metabase-lib/v1/Question";

export function transformSdkQuestion(question: Question): MetabaseQuestion {
  const card = question.card();

  return {
    id: question.id(),
    name: question.displayName() ?? "",
    description: question.description(),
    entityId: card.entity_id,

    isSavedQuestion: question.isSaved(),
  };
}
