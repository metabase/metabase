import slugg from "slugg";
import _ from "underscore";

import type NativeQuery from "../NativeQuery";

export function updateQuestionTagNames(
  query: NativeQuery,
  questions: any,
): NativeQuery {
  const questionById = _.indexBy(questions, "id");
  const newQueryText = query
    .templateTags()
    // only tags for questions
    .filter(tag => tag.type === "card")
    // only tags for given questions
    .filter(tag => tag["card-id"] && questionById[tag["card-id"]])
    // reduce over each tag, updating query text
    .reduce((qText, tag) => {
      const question = tag["card-id"] && questionById[tag["card-id"]];
      const newTagName = `#${question.id}-${slugg(question.name)}`;
      return replaceTagName(qText, tag.name, newTagName);
    }, query.queryText());
  // return a new query with the updated text
  return newQueryText !== query.queryText()
    ? query.setQueryText(newQueryText)
    : query;
}

function replaceTagName(
  queryText: string,
  oldTagName: string,
  newTagName: string,
) {
  return queryText.replace(
    new RegExp(`{{\\s*${oldTagName}\\s*}}`, "g"),
    `{{${newTagName}}}`,
  );
}
