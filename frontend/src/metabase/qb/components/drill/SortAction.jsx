/* @flow */

import Query from "metabase/lib/query";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { t } from "c-3po";
import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

const getClickActionsForSummaryHeader = ({
  currentSortOrder,
  customAction,
}: {
  currentSortOrder: string,
  customAction: () => void,
}) => {
  return [
    {
      name: currentSortOrder === "desc" ? "sort-ascending" : "sort-descending",
      section: "sort",
      title: currentSortOrder === "desc" ? t`Ascending` : t`Descending`,
      customAction,
    },
  ];
};

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  if (!clicked || !clicked.column || !clicked.column.source) return [];
  // $FlowFixMe summaryHeaderCustomSort
  const { summaryHeaderCustomSort } = clicked;
  if (summaryHeaderCustomSort)
    return getClickActionsForSummaryHeader(summaryHeaderCustomSort);

  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  if (clicked.value !== undefined) {
    return [];
  }

  const { column } = clicked;

  const fieldRef = query.fieldReferenceForColumn(column);
  if (!fieldRef) {
    return [];
  }

  const [sortDirection, sortFieldRef] = query.sorts()[0] || [];
  const isAlreadySorted =
    sortFieldRef != null && Query.isSameField(sortFieldRef, fieldRef);

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
