export function hasQuestionCacheSection(question) {
  const type = question.type();

  return (
    type !== "model" &&
    (question.canWrite() || question.lastQueryStart() != null)
  );
}
