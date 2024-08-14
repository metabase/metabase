import cx from "classnames";

import CS from "metabase/css/core/index.css";
import SidebarHeader from "metabase/query_builder/components/SidebarHeader";
import type Filter from "metabase-lib/v1/queries/structured/Filter";

import OperatorSelector from "../filters/OperatorSelector";

type Props = {
  className?: string;

  showFieldPicker?: boolean;
  forceShowOperatorSelector?: boolean;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  onBack: () => void;
};

export function FilterPopoverHeader({
  className,
  showFieldPicker,
  forceShowOperatorSelector,
  filter,
  onFilterChange,
  onBack,
}: Props) {
  const dimension = filter.dimension();
  if (!dimension) {
    return null;
  }

  const field = dimension.field();
  const operator = filter.operatorName();

  const showOperatorSelector = forceShowOperatorSelector ?? !field.isBoolean();
  const showHeader = showFieldPicker || showOperatorSelector;
  const showOperatorSelectorOnOwnRow = !showFieldPicker;

  const setOperator = (operatorName: string) => {
    if (filter.operatorName() !== operatorName) {
      onFilterChange(filter.setOperator(operatorName));
    }
  };

  return showHeader ? (
    <div
      className={cx(className, CS.textMedium, CS.p1, {
        [cx(CS.flex, CS.alignCenter)]: !showOperatorSelectorOnOwnRow,
      })}
    >
      {showFieldPicker && (
        <SidebarHeader
          className={cx(CS.textDefault, CS.py1, {
            [CS.pr2]: !showOperatorSelectorOnOwnRow,
          })}
          title={field.displayName({ includeTable: true })}
          onBack={onBack}
        />
      )}
      {showOperatorSelector && (
        <OperatorSelector
          className={cx(CS.flexNoShrink, CS.block, {
            [CS.mlAuto]: !showOperatorSelectorOnOwnRow,
            [CS.my1]: showOperatorSelectorOnOwnRow,
          })}
          operator={operator}
          operators={filter.filterOperators(operator)}
          onOperatorChange={setOperator}
        />
      )}
    </div>
  ) : null;
}
