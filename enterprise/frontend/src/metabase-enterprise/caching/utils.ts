import type Question from "metabase-lib/v1/Question";

export function hasQuestionCacheSection(question: Question) {
  const type = question.type();

  return (
    type !== "model" &&
    (question.canWrite() || question.lastQueryStart() != null)
  );
}
