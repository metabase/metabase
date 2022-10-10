import Question from "metabase-lib/lib/Question";

export function getSegmentOrMetricQuestion(query, table, metadata) {
  if (!table) {
    return Question.create({ metadata });
  }

  return Question.create({
    dataset_query: { type: "query", database: table.db_id, query },
    metadata,
  });
}

export function getDefaultSegmentOrMetricQuestion(table, metadata) {
  const { id: tableId, db_id: databaseId } = table;
  const question = Question.create({ databaseId, tableId, metadata });

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
