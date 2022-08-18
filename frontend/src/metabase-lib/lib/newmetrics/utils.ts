import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Field from "metabase-lib/lib/metadata/Field";
import { Aggregation } from "metabase-types/types/Query";
import { Metric } from "metabase-types/api/newmetric";

function findDateField(question: Question) {
  const query = question.query() as StructuredQuery;

  // note: `query.dimension()` excludes join dimensions, which I think we want to include
  const dimensionOptions = query.dimensionOptions();
  const dateDimension = dimensionOptions.find(dimension => {
    const field = dimension.field();
    return field.isDate();
  });

  return dateDimension?.field();
}

function hasDateField(question: Question): boolean {
  if (!question.isStructured()) {
    return false;
  }

  const dateField = findDateField(question);

  return !!dateField;
}

export function canBeUsedAsMetric(
  question: Question | null | undefined,
): question is Question {
  return (
    !!question &&
    question.isStructured() &&
    (question.query() as StructuredQuery).aggregations().length === 1 &&
    hasDateField(question)
  );
}

export function generateFakeMetricFromQuestion(
  question: Question,
): Metric | null {
  // guaranteeing the below type assertions are valid
  if (!canBeUsedAsMetric(question)) {
    return null;
  }

  const query = question.query() as StructuredQuery;
  const aggregation = query.aggregations()[0].raw() as Aggregation;
  const dateField = findDateField(question) as Field;
  const columnName = dateField.name;
  const ref = dateField.reference();

  return {
    id: question.id(),
    name: `${question.id()}_metric`,
    display_name: `${question.displayName()} Metric`,
    description: "",
    archived: false,
    card_id: question.id(),
    measure: aggregation,
    dimensions: [[columnName, ref]],
    granularities: [],
    default_granularity: "",
    creator_id: 1,
    created_at: "",
    updated_at: "",
  };
}
