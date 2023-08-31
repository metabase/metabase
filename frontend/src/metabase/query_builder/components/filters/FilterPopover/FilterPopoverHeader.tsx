import { useContext, useMemo } from "react";
import cx from "classnames";

import { FilterContext } from "metabase/common/context";
import * as ML from "metabase-lib";
import { toLegacyFilter, getOperatorsMap } from "metabase-lib/compat";

import { OperatorSelector } from "../OperatorSelector";
import SidebarHeader from "../../SidebarHeader";

type Props = {
  className?: string;
  showFieldPicker?: boolean;
  forceShowOperatorSelector?: boolean;
  onFilterChange: (filter: any[]) => void;
  onBack: () => void;
};

export function FilterPopoverHeader({
  className,
  showFieldPicker,
  forceShowOperatorSelector,
  onFilterChange,
  onBack,
}: Props) {
  const { filter, query, legacyQuery, column, stageIndex } =
    useContext(FilterContext);

  const { operator, args } = filter
    ? ML.filterParts(query as ML.Query, stageIndex, filter)
    : { args: [], operator: undefined };

  const operatorName = operator
    ? ML.displayInfo(query as ML.Query, stageIndex, operator)?.shortName
    : undefined;

  const operatorsMap = useMemo(
    () => getOperatorsMap({ query, stageIndex, column }),
    [column, query, stageIndex],
  );

  if (!column || !query || !legacyQuery) {
    return null;
  }

  const showOperatorSelector =
    forceShowOperatorSelector ?? !ML.isBoolean(column);
  const showHeader = showFieldPicker || showOperatorSelector;
  const showOperatorSelectorOnOwnRow = !showFieldPicker;

  const setOperator = (newOperatorName: string) => {
    if (newOperatorName === operatorName) {
      return;
    }
    const newOperator = operatorsMap[newOperatorName];

    const newFilter = ML.filterClause(newOperator, column, ...args);

    onFilterChange(toLegacyFilter(query, legacyQuery, newFilter));
  };

  return showHeader ? (
    <div
      className={cx(className, "text-medium p1", {
        "flex align-center": !showOperatorSelectorOnOwnRow,
      })}
    >
      {showFieldPicker && (
        <SidebarHeader
          className={cx("text-default py1", {
            pr2: !showOperatorSelectorOnOwnRow,
          })}
          title={ML.displayInfo(query, stageIndex, column)?.displayName}
          onBack={onBack}
        />
      )}
      {showOperatorSelector && (
        <OperatorSelector
          className={cx("flex-no-shrink block", {
            "ml-auto": !showOperatorSelectorOnOwnRow,
            my1: showOperatorSelectorOnOwnRow,
          })}
          operatorName={operatorName ?? ""}
          operators={ML.filterableColumnOperators(column).map(op =>
            ML.displayInfo(query, stageIndex, op),
          )}
          onOperatorChange={setOperator}
        />
      )}
    </div>
  ) : null;
}
