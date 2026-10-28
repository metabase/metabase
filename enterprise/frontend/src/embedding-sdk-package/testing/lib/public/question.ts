import type { MetabaseQuestion } from "embedding-sdk-bundle/types/question";

export function createMockQuestion(
  opts?: Partial<MetabaseQuestion>,
): MetabaseQuestion {
  return {
    id: 1,
    name: "Question",
    description: null,
    entityId: "mockQuestionEntityId",
    isSavedQuestion: true,
    ...opts,
  };
}
