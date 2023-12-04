import { useMemo, useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import type {
  DashboardCard,
  ClickBehavior,
  ClickBehaviorType,
  DatasetColumn,
} from "metabase-types/api";

import { hasActionsMenu } from "metabase/lib/click-behavior";
import { Column } from "./Column";

const COLUMN_SORTING_ORDER_BY_CLICK_BEHAVIOR_TYPE = [
  "link",
  "crossfilter",
  "actionMenu",
];

function explainClickBehaviorType(
  type: ClickBehaviorType,
  dashcard: DashboardCard,
) {
  return {
    action: t`Execute an action`,
    actionMenu: hasActionsMenu(dashcard)
      ? t`Open the drill-through menu`
      : t`Do nothing`,
    crossfilter: t`Update a dashboard filter`,
    link: t`Go to custom destination`,
  }[type];
}

interface Props {
  columns: DatasetColumn[];
  dashcard: DashboardCard;
  getClickBehaviorForColumn: (
    column: DatasetColumn,
  ) => ClickBehavior | undefined;
  onColumnClick: (column: DatasetColumn) => void;
}

export function TableClickBehaviorView({
  columns,
  dashcard,
  getClickBehaviorForColumn,
  onColumnClick,
}: Props) {
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
