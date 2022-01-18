import Question from "metabase-lib/lib/Question";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { TemplateTag } from "metabase-types/types/Query";

export function isSupportedTemplateTagForModel(tag: TemplateTag) {
  return tag.type === "card";
}

export function checkCanBeModel(question: Question) {
  if (!question.isNative()) {
    return true;
  }
  const query = (question.query() as unknown) as NativeQuery;
  return query.templateTags().every(isSupportedTemplateTagForModel);
}
