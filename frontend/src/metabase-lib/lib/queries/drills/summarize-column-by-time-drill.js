import {
  getAggregationOperator,
  isCompatibleAggregationOperatorForField,
} from "metabase/lib/schema_metadata";
import { fieldRefForColumn } from "metabase-lib/lib/queries/utils/dataset";

export function summarizeColumnByTimeDrill({ question, clicked }) {
  const { column, value } = clicked;
  const query = question.query();
  const isStructured = question.isStructured();

  if (!column || value !== undefined || !isStructured || !query.isEditable()) {
    return null;
  }

  const dimensionOptions = query.dimensionOptions(d => d.field().isDate());
  const dateDimension = dimensionOptions.all()[0];
  if (!dateDimension) {
    return null;
  }

  const aggregator = getAggregationOperator("sum");
  if (!isCompatibleAggregationOperatorForField(aggregator, column)) {
    return null;
  }

  return true;
}

export function summarizeColumnByTimeDrillQuestion({ question, clicked }) {
  const { column } = clicked;
  const query = question.query();
  const dimensionOptions = query.dimensionOptions(d => d.field().isDate());
  const dateDimension = dimensionOptions.all()[0];

  return question
    .aggregate(["sum", fieldRefForColumn(column)])
    .pivot([dateDimension.defaultBreakout()]);
}
