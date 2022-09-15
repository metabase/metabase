/* eslint-disable react/prop-types */
import { t } from "ttag";
import _ from "underscore";
import { fieldRefForColumn } from "metabase/lib/dataset";

import { TYPE, isa } from "metabase/lib/types";
import {
  getAggregationOperator,
  isCompatibleAggregationOperatorForField,
} from "metabase/lib/schema_metadata";
import { ClickActionProps } from "metabase-types/types/Visualization";
import { AggregationOperator } from "metabase-types/types/Metadata";

const INVALID_TYPES = [TYPE.Structured];

type Action = { section: string; buttonType: string; title: string };

const AGGREGATIONS: Record<string, Action> = {
  sum: {
    section: "sum",
    buttonType: "token",
    title: t`Sum`,
  },
  avg: {
    section: "sum",
    buttonType: "token",
    title: t`Avg`,
  },
  distinct: {
    section: "sum",
    buttonType: "token",
    title: t`Distinct values`,
  },
};

export default ({ question, clicked = {} }: ClickActionProps) => {
  const { column, value } = clicked;
  if (
    !column ||
    value !== undefined ||
    _.any(
      INVALID_TYPES,
      type => clicked.column?.base_type && isa(clicked.column.base_type, type),
    )
  ) {
    return [];
  }

  const query = question.query();
  if (!question.isStructured() || !query.isEditable()) {
    return [];
  }

  const aggregators = Object.entries(AGGREGATIONS).map(
    ([aggregationShort, action]) => [
      getAggregationOperator(aggregationShort),
      action,
    ],
  ) as [AggregationOperator, Action][];
  return aggregators
    .filter(([aggregator]) =>
      isCompatibleAggregationOperatorForField(aggregator, column),
    )
    .map(([aggregator, action]) => ({
      name: action.title.toLowerCase(),
      ...action,
      question: () =>
        query
          .aggregate([aggregator.short, fieldRefForColumn(column)])
          .question()
          .setDefaultDisplay(),
      action: () => (dispatch: any) => {
        // HACK: drill through closes sidebars, so open sidebar asynchronously
        setTimeout(() => {
          dispatch({ type: "metabase/qb/EDIT_SUMMARY" });
        });
      },
    }));
};
