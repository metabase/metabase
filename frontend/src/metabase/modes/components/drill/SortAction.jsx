/* @flow */

import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
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

export default ({
  question,
  settings,
  clicked,
}: ClickActionProps): ClickAction[] => {
  const query = question.query();

  if (!(query instanceof StructuredQuery || query instanceof NativeQuery)) {
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

  const [sortSetting] =
    (query instanceof NativeQuery && settings["table.sort"]) || [];
  const [querySort] = query instanceof StructuredQuery ? query.sorts() : [];
  const [sortDirection, sortFieldRef] = querySort || sortSetting || [];
  const isAlreadySorted =
    sortFieldRef != null && Dimension.isEqual(fieldRef, sortFieldRef);

  const addSort = sort => {
    if (query instanceof NativeQuery) {
      return {
        action: () =>
          updateQuestion(question.updateSettings({ "table.sort": [sort] })),
      };
    } else if (query instanceof StructuredQuery) {
      return { question: () => query.replaceSort(sort).question() };
    }
  };

  const actions = [];
  if (!isAlreadySorted || sortDirection === "desc") {
    actions.push({
      name: "sort-ascending",
      section: "sort",
      title: t`Ascending`,
      ...addSort(["asc", fieldRef]),
    });
  }
  if (!isAlreadySorted || sortDirection === "asc") {
    actions.push({
      name: "sort-descending",
      section: "sort",
      title: t`Descending`,
      ...addSort(["desc", fieldRef]),
    });
  }
  return actions;
};
