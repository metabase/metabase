import slugg from "slugg";
import _ from "underscore";

import type NativeQuery from "../NativeQuery";

export function updateReferencedQuestionTagName(
  queryText: string,
  question: any,
  oldTagName: string,
) {
  const newTagName = `#${question.id}-${slugg(question.name)}`;
  return queryText.replace(
    new RegExp(`{{\\s*${oldTagName}\\s*}}`, "g"),
    `{{${newTagName}}}`,
  );
}

export function updateReferencedQuestionNames(
  query: NativeQuery,
  questions: any,
): NativeQuery {
  const questionsById = _.indexBy(questions, "id");
  const newQueryText = query
    .templateTags()
    // only tags for questions
    .filter(tag => tag.type === "card")
    // only tags that match given questions
    .filter(tag => questionsById[tag["card-id"]])
    // for each tag, update the tag name in the queryText
    .reduce((qText, tag) => {
      const question = questionsById[tag["card-id"]];
      return updateReferencedQuestionTagName(qText, question, tag.name);
    }, query.queryText());
  return newQueryText === query.queryText()
    ? query
    : query.setQueryText(newQueryText);
}
