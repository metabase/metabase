/* @flow */

import { t } from "c-3po";
import { TYPE, isa } from "metabase/lib/types";
import _ from "underscore";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

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
