/* eslint-disable react/prop-types */
import React, { useMemo, useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import { hasActionsMenu } from "metabase/lib/click-behavior";

import Column from "./Column";

const COLUMN_SORTING_ORDER_BY_CLICK_BEHAVIOR_TYPE = [
  "link",
  "crossfilter",
  "actionMenu",
];

function explainClickBehaviorType(type, dashcard) {
  return {
    link: t`Go to custom destination`,
    crossfilter: t`Update a dashboard filter`,
    actionMenu: hasActionsMenu(dashcard)
      ? t`Open the actions menu`
      : t`Do nothing`,
  }[type];
}

function TableClickBehaviorView({
  columns,
  dashcard,
  getClickBehaviorForColumn,
  onColumnClick,
}) {
  const groupedColumns = useMemo(() => {
    const withClickBehaviors = columns.map(column => ({
      column,
      clickBehavior: getClickBehaviorForColumn(column),
    }));
    const groupedByClickBehavior = _.groupBy(
      withClickBehaviors,
      ({ clickBehavior }) => {
        return clickBehavior?.type || "actionMenu";
      },
    );

    const pairs = _.pairs(groupedByClickBehavior);
    return _.sortBy(pairs, ([type]) =>
      COLUMN_SORTING_ORDER_BY_CLICK_BEHAVIOR_TYPE.indexOf(type),
    );
  }, [columns, getClickBehaviorForColumn]);

  const renderColumn = useCallback(
    ({ column, clickBehavior }, index) => {
      return (
        <Column
          key={index}
          column={column}
          clickBehavior={clickBehavior}
          onClick={() => onColumnClick(column)}
        />
      );
    },
    [onColumnClick],
  );

  const renderColumnGroup = useCallback(
    group => {
      const [clickBehaviorType, columnsWithClickBehavior] = group;
      return (
        <div key={clickBehaviorType} className="mb2 px4">
          <h5 className="text-uppercase text-medium my1">
            {explainClickBehaviorType(clickBehaviorType, dashcard)}
          </h5>
          {columnsWithClickBehavior.map(renderColumn)}
        </div>
      );
    },
    [dashcard, renderColumn],
  );

  return <>{groupedColumns.map(renderColumnGroup)}</>;
}

export default TableClickBehaviorView;
