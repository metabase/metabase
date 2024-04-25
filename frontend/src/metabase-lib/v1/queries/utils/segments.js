import Question from "metabase-lib/v1/Question";

export function getSegmentOrMetricQuestion(query, table, metadata) {
  return table
    ? metadata.table(table.id).legacyQuery(query).question()
    : Question.create({ metadata });
}

export function getDefaultSegmentOrMetricQuestion(table, metadata) {
  const question = metadata.table(table.id).question();

  if (table.entity_type === "entity/GoogleAnalyticsTable") {
    const dateField = table.fields.find(f => f.name === "ga:date");
    if (dateField) {
      return question
        .legacyQuery({ useStructuredQuery: true })
        .filter(["time-interval", ["field", dateField.id, null], -365, "day"])
        .aggregate(["metric", "ga:users"])
        .question();
    }
  } else {
    return question
      .legacyQuery({ useStructuredQuery: true })
      .aggregate(["count"])
      .question();
  }

  return null;
}
