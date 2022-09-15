import slugg from "slugg";
import _ from "underscore";

import type NativeQuery from "../NativeQuery";

export function updateQuestionTagNames(
  query: NativeQuery,
  questions: any,
): NativeQuery {
  const questionsById = _.indexBy(questions, "id");
  const newQueryText = query
    .templateTags()
    .filter(tag => tag.type === "card") // only tags for questions
    .filter(tag => tag["card-id"] && questionsById[tag["card-id"]]) // only tags for given questions
    .reduce((qText, tag) => {
      // reduce over each tag, updating query text
      const question = tag["card-id"] && questionsById[tag["card-id"]]; // get question for tag
      const newTagName = `#${question.id}-${slugg(question.name)}`; // calculate tag name for question
      return replaceTagName(qText, tag.name, newTagName); // update tag name in query text
    }, query.queryText());
  return newQueryText !== query.queryText() // return a new query with the updated text
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
