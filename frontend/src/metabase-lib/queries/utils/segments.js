import Question from "metabase-lib/Question";

export function getSegmentOrMetricQuestion(query, table, metadata) {
  return table
    ? metadata.table(table.id).query(query).question()
    : Question.create({ metadata });
}

export function getDefaultSegmentOrMetricQuestion(table, metadata) {
  const question = metadata.table(table.id).question();
  return question.aggregate(["count"]);
}
