/* @flow */

import { isFK, isPK } from "metabase/lib/schema_metadata";
import { t } from "ttag";
import type {
  ClickAction,
  ClickActionProps,
} from "metabase-types/types/Visualization";

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
  let field = question.metadata().field(clicked.column.id);
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
      question: () =>
        field ? question.drillPK(field, clicked && clicked.value) : question,
    },
  ];
};
