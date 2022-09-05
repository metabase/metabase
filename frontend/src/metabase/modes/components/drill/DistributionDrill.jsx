/* eslint-disable react/prop-types */
import { t } from "ttag";
import { TYPE, isa } from "metabase/lib/types";

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
    DENYLIST_TYPES.some(t => isa(clicked.column.semantic_type, t)) ||
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
