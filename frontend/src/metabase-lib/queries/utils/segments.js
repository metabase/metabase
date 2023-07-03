import Question from "metabase-lib/Question";

export function getSegmentOrMetricQuestion(query, table, metadata) {
  return table
    ? metadata.table(table.id).query(query).question()
    : Question.create({ metadata });
}

export function getDefaultSegmentOrMetricQuestion(table, metadata) {
  const question = metadata.table(table.id).question();

  if (table.entity_type === "entity/GoogleAnalyticsTable") {
    const dateField = table.fields.find(f => f.name === "ga:date");
    if (dateField) {
      return question
        .filter(["time-interval", ["field", dateField.id, null], -365, "day"])
        .aggregate(["metric", "ga:users"]);
    }
  } else {
    return question.aggregate(["count"]);
  }

  return null;
}
