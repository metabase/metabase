import { t } from "ttag";
import { TYPE, isa } from "metabase/lib/types";
import _ from "underscore";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase-types/types/Visualization";

const DENYLIST_TYPES = [
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
    _.any(DENYLIST_TYPES, t => isa(clicked.column.semantic_type, t))
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
