import Question from "metabase-lib/v1/Question";

export function getSegmentOrMetricQuestion(query, table, metadata) {
  return table
    ? metadata.table(table.id).legacyQuery(query).question()
    : Question.create({ metadata });
}

export function getDefaultSegmentOrMetricQuestion(table, metadata) {
  const question = metadata.table(table.id).question();

  return question
    .legacyQuery({ useStructuredQuery: true })
    .aggregate(["count"])
    .question();
}
