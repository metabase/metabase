/* @flow */

import { t } from "ttag";
import { TYPE, isa } from "metabase/lib/types";
import _ from "underscore";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase-types/types/Visualization";

const BLACKLIST_TYPES = [
  TYPE.PK,
  TYPE.SerializedJSON,
  TYPE.Description,
  TYPE.Comment,
];

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  if (
    !clicked ||
    !clicked.column ||
    clicked.value !== undefined ||
    clicked.column.source !== "fields" ||
    // $FlowFixMe: flow thinks `clicked` or `clicked.column` may be null even though we checked it above
    _.any(BLACKLIST_TYPES, t => isa(clicked.column.special_type, t))
  ) {
    return [];
  }
  const { column } = clicked;

  return [
    {
      name: "distribution",
      title: t`Distribution`,
      section: "distribution",
      question: () => question.distribution(column),
    },
  ];
};
