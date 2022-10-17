import {
  getAggregationOperator,
  isCompatibleAggregationOperatorForField,
} from "metabase-lib/lib/operators/utils";
import { fieldRefForColumn } from "metabase-lib/lib/queries/utils/dataset";

export function summarizeColumnByTimeDrill({ question, clicked }) {
  const { column, value } = clicked;
  const query = question.query();
  const isStructured = question.isStructured();

  if (!column || value !== undefined || !isStructured || !query.isEditable()) {
    return false;
  }

  const dimensionOptions = query.dimensionOptions(d => d.field().isDate());
  const dateDimension = dimensionOptions.all()[0];
  if (!dateDimension) {
    return false;
  }

  const aggregator = getAggregationOperator("sum");
  return isCompatibleAggregationOperatorForField(aggregator, column);
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
