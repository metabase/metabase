export function hasQuestionCacheSection(question) {
  const type = question.type();

  return (
    type === "question" &&
    (question.canWrite() || question.lastQueryStart() != null)
  );
}
