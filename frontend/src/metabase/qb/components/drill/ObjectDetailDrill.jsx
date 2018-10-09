/* @flow */

import { isFK, isPK } from "metabase/lib/schema_metadata";
import { t } from "c-3po";
import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  if (
    !clicked ||
    !clicked.column ||
    clicked.value === undefined ||
    !(isFK(clicked.column) || isPK(clicked.column))
  ) {
    return [];
  }

  // $FlowFixMe
  let field = question.metadata().fields[clicked.column.id];
  if (!field) {
    return [];
  }

  if (field.target) {
    field = field.target;
  }

  if (!clicked) {
    return [];
  }

  return [
    {
      name: "object-detail",
      section: "details",
      title: t`View details`,
      default: true,
      question: () => question.drillPK(field, clicked && clicked.value),
    },
  ];
};
