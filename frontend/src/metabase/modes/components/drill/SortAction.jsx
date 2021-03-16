import { t } from "ttag";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Dimension from "metabase-lib/lib/Dimension";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase-types/types/Visualization";

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  if (
    !clicked ||
    !clicked.column ||
    clicked.value !== undefined ||
    !clicked.column.source
  ) {
    return [];
  }
  const { column } = clicked;

  const fieldRef = query.fieldReferenceForColumn(column);
  if (!fieldRef) {
    return [];
  }

  const [sortDirection, sortFieldRef] = query.sorts()[0] || [];
  const isAlreadySorted =
    sortFieldRef != null && Dimension.isEqual(fieldRef, sortFieldRef);

  const actions = [];
  if (!isAlreadySorted || sortDirection === "desc") {
    actions.push({
      name: "sort-ascending",
      section: "sort",
      buttonType: "sort",
      icon: "arrow_up",
      tooltip: t`Sort ascending`,
      question: () => query.replaceSort(["asc", fieldRef]).question(),
    });
  }
  if (!isAlreadySorted || sortDirection === "asc") {
    actions.push({
      name: "sort-descending",
      section: "sort",
      buttonType: "sort",
      icon: "arrow_down",
      tooltip: t`Sort descending`,
      question: () => query.replaceSort(["desc", fieldRef]).question(),
    });
  }
  return actions;
};
