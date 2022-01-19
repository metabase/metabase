import Question from "metabase-lib/lib/Question";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import Database from "metabase-lib/lib/metadata/Database";
import { TemplateTag } from "metabase-types/types/Query";

export function isSupportedTemplateTagForModel(tag: TemplateTag) {
  return tag.type === "card";
}

export function checkDatabaseSupportsModels(database: Database) {
  return database.hasFeature("nested-queries");
}

export function checkCanBeModel(question: Question) {
  const query = question.query();
  const db = query.database();

  if (!db || !checkDatabaseSupportsModels(db)) {
    return false;
  }

  if (!question.isNative()) {
    return true;
  }

  return (query as NativeQuery)
    .templateTags()
    .every(isSupportedTemplateTagForModel);
}
