import { isProduction } from "metabase/env";
import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Dimension from "metabase-lib/lib/Dimension";
import Field from "metabase-lib/lib/metadata/Field";
import { Aggregation, ConcreteField } from "metabase-types/types/Query";
import { Metric } from "metabase-types/api/newmetric";

function findDateDimension(question: Question) {
  const query = question.query() as StructuredQuery;

  // note: `query.dimension()` excludes join dimensions, which I think we want to include
  const dimensionOptions = query.dimensionOptions();
  const dateDimension = dimensionOptions.find(dimension => {
    const field = dimension.field();
    return field.isDate();
  });

  return dateDimension;
}

function findNumberDimension(question: Question) {
  const query = question.query() as StructuredQuery;

  // note: `query.dimension()` excludes join dimensions, which I think we want to include
  const dimensionOptions = query.dimensionOptions();
  const numberDimension = dimensionOptions.find(dimension => {
    const field = dimension.field();
    return field.isNumber() && !field.isID();
  });

  return numberDimension;
}

export function canBeUsedAsMetric(
  question: Question | null | undefined,
): question is Question {
  return (
    !!question &&
    question.isStructured() &&
    !!findDateDimension(question) &&
    !!findNumberDimension(question)
  );
}

export function generateFakeMetricFromQuestion(
  question: Question,
): Partial<Metric> | null {
  // guaranteeing the below type assertions are valid
  if (!canBeUsedAsMetric(question)) {
    return null;
  }

  const dateDimension = findDateDimension(question) as Dimension;
  const columnName = dateDimension.columnName();
  // having a defined "temporal-unit" here messes things up -- beware!
  const dateRef = dateDimension.baseDimension().mbql();

  const numberDimension = findNumberDimension(question) as Dimension;
  const numberRef = numberDimension.mbql();

  // refs must be `ConcreteField`s
  if (
    !dateRef ||
    !numberRef ||
    dateRef[0] === "aggregation" ||
    numberRef[0] === "aggregation"
  ) {
    return null;
  }

  return {
    name: `${question.displayName()} Metric`,
    description: "",
    archived: false,
    card_id: question.id(),
    measure: ["sum", numberRef],
    dimensions: [[columnName, dateRef]],
    granularities: ["quarter", "week", "month", "year"],
    default_granularity: "month",
    collection_id: null,
  };
}

export function applyMetricToQuestion(
  question: Question,
  metric: Metric,
): Question | null {
  const query = question.query() as StructuredQuery;
  const { dimensions, measure } = metric;
  const [, dateFieldRef] = dimensions[0];
  // convert the fieldRef to a dimension so that we can set a temporal-unit
  // in the fieldRef's option arg
  const dateDimension = Dimension.parseMBQL(
    dateFieldRef,
    query.metadata(),
    query,
  );

  if (!dateDimension) {
    return null;
  }

  const dateDimensionWithTemporalUnit = dateDimension.withTemporalUnit(
    isProduction ? "day" : "month",
  );
  const newFieldRef = dateDimensionWithTemporalUnit.mbql() as ConcreteField;
  let metricQuery = query.addAggregation(measure).addBreakout(newFieldRef);

  if (isProduction) {
    metricQuery = metricQuery.addFilter([
      "time-interval",
      dateFieldRef,
      -30,
      "day",
    ]);
  }

  return metricQuery.question();
}
