import _ from "underscore";
import { isa, TYPE } from "metabase/lib/types";
import {
  getAggregationOperator,
  isCompatibleAggregationOperatorForField,
} from "metabase/lib/schema_metadata";
import { fieldRefForColumn } from "metabase-lib/lib/queries/utils/dataset";

const AGGREGATIONS = ["sum", "avg", "distinct"];
const INVALID_TYPES = [TYPE.Structured];

export function summarizeColumnDrill({ question, clicked }) {
  if (!clicked) {
    return null;
  }

  const { column, value } = clicked;

  if (
    !column ||
    value !== undefined ||
    _.any(INVALID_TYPES, type => isa(clicked.column.base_type, type))
  ) {
    return null;
  }

  const query = question.query();
  if (!question.isStructured() || !query.isEditable()) {
    return null;
  }

  const aggregationOperators = AGGREGATIONS.map(aggregationShort =>
    getAggregationOperator(aggregationShort),
  ).filter(aggregationOperator =>
    isCompatibleAggregationOperatorForField(aggregationOperator, column),
  );

  if (!aggregationOperators.length) {
    return null;
  }

  return {
    aggregationOperators,
  };
}

export function summarizeColumnDrillQuestion({
  question,
  clicked,
  aggregationOperator,
}) {
  const { column } = clicked;
  const query = question.query();

  return query
    .aggregate([aggregationOperator.short, fieldRefForColumn(column)])
    .question()
    .setDefaultDisplay();
}
