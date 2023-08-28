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

  const tableName = query.table() && query.table().displayName();

  return {
    // here we expect rows count of an aggregated query item, but actually we have numeric metric value, so
    // we don't really know number of rows in original un-aggregated data
    value: getNormalizedValue(clicked.value),
    tableName,
  };
}

function getNormalizedValue(value) {
  const numberValue = typeof value === "number" ? value : 2;

  return numberValue < 0 ? 2 : numberValue;
}

export function underlyingRecordsDrillQuestion({ question, clicked }) {
  // removes post-aggregation filter stage
  clicked = clicked && question.topLevelClicked(clicked);
  question = question.topLevelQuestion();

  const dimensions = clicked?.dimensions ?? [];
  return question.drillUnderlyingRecords(dimensions, clicked.column);
}
