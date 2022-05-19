/* eslint-disable react/prop-types */
import { t } from "ttag";
import { TYPE, isa } from "metabase/lib/types";
import _ from "underscore";

const DENYLIST_TYPES = [
  TYPE.PK,
  TYPE.SerializedJSON,
  TYPE.Description,
  TYPE.Comment,
];

export default ({ question, clicked }) => {
  if (
    !clicked ||
    !clicked.column ||
    clicked.value !== undefined ||
    _.any(DENYLIST_TYPES, t => isa(clicked.column.semantic_type, t)) ||
    !question.query().isEditable()
  ) {
    return [];
  }
  const { column } = clicked;

  return [
    {
      name: "distribution",
      title: t`Distribution`,
      buttonType: "horizontal",
      section: "summarize",
      icon: "bar",
      question: () => question.distribution(column),
    },
  ];
};
