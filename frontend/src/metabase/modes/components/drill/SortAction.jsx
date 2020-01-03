/* @flow */

import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import Dimension from "metabase-lib/lib/Dimension";

import { t } from "ttag";
import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

// NOTE: cyclical dependency
// import { updateQuestion } from "metabase/query_builder/actions";
function updateQuestion(...args) {
  return require("metabase/query_builder/actions").updateQuestion(...args);
}

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  const query = question.query();

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
  if (query instanceof NativeQuery) {
    return [
      {
        name: "sort-ascending",
        section: "sort",
        title: t`Ascending`,
        action: () =>
          updateQuestion(
            question.updateSettings({ "table.sort": [["asc", fieldRef]] }),
          ),
      },
      {
        name: "sort-descending",
        section: "sort",
        title: t`Descending`,
        action: () =>
          updateQuestion(
            question.updateSettings({ "table.sort": [["desc", fieldRef]] }),
          ),
      },
    ];
  }

  const [sortDirection, sortFieldRef] = query.sorts()[0] || [];
  const isAlreadySorted =
    sortFieldRef != null && Dimension.isEqual(fieldRef, sortFieldRef);

  const actions = [];
  if (!isAlreadySorted || sortDirection === "desc") {
    actions.push({
      name: "sort-ascending",
      section: "sort",
      title: t`Ascending`,
      question: () => query.replaceSort(["asc", fieldRef]).question(),
    });
  }
  if (!isAlreadySorted || sortDirection === "asc") {
    actions.push({
      name: "sort-descending",
      section: "sort",
      title: t`Descending`,
      question: () => query.replaceSort(["desc", fieldRef]).question(),
    });
  }
  return actions;
};
