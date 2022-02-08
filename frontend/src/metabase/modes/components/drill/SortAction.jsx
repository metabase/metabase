import { t } from "ttag";
import Dimension from "metabase-lib/lib/Dimension";

export default ({ question, clicked }) => {
  const query = question.query();
  if (!question.isStructured() || !query.isEditable()) {
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
