import Question from "metabase-lib/lib/Question";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

export function checkCanBeModel(question: Question) {
  if (!question.isNative()) {
    return true;
  }
  const query = (question.query() as unknown) as NativeQuery;
  return query.templateTags().every(tag => tag.type === "card");
}
