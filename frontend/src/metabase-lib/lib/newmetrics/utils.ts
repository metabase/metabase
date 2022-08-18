import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

function hasDateField(question: Question): boolean {
  if (!question.isStructured()) {
    return false;
  }

  const query = question.query() as StructuredQuery;

  // note: `query.dimension()` excludes join dimensions, which I think we want to include
  const dimensionOptions = query.dimensionOptions();
  const dateDimension = dimensionOptions.find(dimension => {
    const field = dimension.field();
    return field.isDate();
  });

  return !!dateDimension;
}

export function canBeUsedAsMetric(question: Question): boolean {
  return (
    question.isStructured() &&
    (question.query() as StructuredQuery).aggregations().length === 1 &&
    hasDateField(question)
  );
}
