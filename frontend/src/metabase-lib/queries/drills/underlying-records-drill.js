export function underlyingRecordsDrill({ question, clicked }) {
  // removes post-aggregation filter stage
  clicked = clicked && question.topLevelClicked(clicked);
  question = question.topLevelQuestion();

  const query = question.query();
  if (!question.isStructured() || !query.isEditable()) {
    return null;
  }

  const dimensions = clicked?.dimensions ?? [];
  if (!clicked || dimensions.length === 0) {
    return null;
  }

  // the metric value should be the number of rows that will be displayed
  const rowCount = typeof clicked.value === "number" ? clicked.value : 2;
  const tableName = query.table() && query.table().displayName();

  return {
    rowCount,
    tableName,
  };
}

export function underlyingRecordsDrillQuestion({ question, clicked }) {
  // removes post-aggregation filter stage
  const topLevelClicked = clicked && question.topLevelClicked(clicked);
  const topLevelQuestion = question.topLevelQuestion();

  const dimensions = topLevelClicked?.dimensions ?? [];
  return topLevelQuestion.drillUnderlyingRecords(
    dimensions,
    topLevelClicked.column,
  );
}
