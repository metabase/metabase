/* @flow */

import Query from "metabase/lib/query";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { t } from "c-3po";
import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

const getClickActionsForSummaryHeader = ({currentSortOrder, customAction}) =>{
  return [
    {name: currentSortOrder === 'desc' ? "sort-ascending" : "sort-descending",
    section: "sort",
    title: currentSortOrder === 'desc' ? t`Ascending`: t`Descending`,
    customAction
    }
  ];
};

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {

  if (
    !clicked ||
    !clicked.column ||
    !clicked.column.source
  )
    return [];

  if(clicked.summaryHeaderCustomSort)
    return getClickActionsForSummaryHeader(clicked.summaryHeaderCustomSort);


  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  if(clicked.value !== undefined) {
    return [];
  }

  const { column } = clicked;

  const fieldRef = query.fieldReferenceForColumn(column);
  if (!fieldRef) {
    return [];
  }

  const [sortFieldRef, sortDirection] = query.sorts()[0] || [];
  const isAlreadySorted =
    sortFieldRef != null && Query.isSameField(sortFieldRef, fieldRef);

  const actions = [];
  if (
    !isAlreadySorted ||
    sortDirection === "descending" ||
    sortDirection === "desc"
  ) {
    actions.push({
      name: "sort-ascending",
      section: "sort",
      title: t`Ascending`,
      question: () => query.replaceSort([fieldRef, "ascending"]).question(),
    });
  }
  if (
    !isAlreadySorted ||
    sortDirection === "ascending" ||
    sortDirection === "asc"
  ) {
    actions.push({
      name: "sort-descending",
      section: "sort",
      title: t`Descending`,
      question: () => query.replaceSort([fieldRef, "descending"]).question(),
    });
  }
  return actions;
};
