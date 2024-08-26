import cx from "classnames";
import * as React from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import type Filter from "metabase-lib/v1/queries/structured/Filter";
import {
  getAfterDateFilter,
  getBeforeDateFilter,
  getBetweenDateFilter,
  getCurrentDateFilter,
  getExcludeDateFilter,
  getNextDateFilter,
  getOnDateFilter,
  getPreviousDateFilter,
  isAfterDateFilter,
  isBeforeDateFilter,
  isBetweenFilter,
  isCurrentDateFilter,
  isExcludeDateFilter,
  isNextDateFilter,
  isOnDateFilter,
  isPreviousDateFilter,
} from "metabase-lib/v1/queries/utils/date-filters";
import { isStartingFrom } from "metabase-lib/v1/queries/utils/query-time";

import CurrentPicker from "./CurrentPicker";
import DatePickerFooter from "./DatePickerFooter";
import DatePickerHeader from "./DatePickerHeader";
import type { DateShortcutOptions } from "./DatePickerShortcutOptions";
import DatePickerShortcuts from "./DatePickerShortcuts";
import ExcludeDatePicker from "./ExcludeDatePicker";
import { AfterPicker, BeforePicker, BetweenPicker } from "./RangeDatePicker";
import { NextPicker, PastPicker } from "./RelativeDatePicker";
import SingleDatePicker from "./SingleDatePicker";

export type DatePickerGroup = "relative" | "specific";

export type DateOperator = {
  name: string;
  displayName: string;
  displayPrefix?: string;
  init: (filter: Filter) => any[];
  test: (filter: Filter) => boolean;
  widget: any;
  group?: DatePickerGroup;
  options?: any;
};

export const DATE_OPERATORS: DateOperator[] = [
  {
    name: "previous",
    displayName: t`Previous`,
    init: filter => getPreviousDateFilter(filter),
    test: filter => isPreviousDateFilter(filter),
    group: "relative",
    widget: PastPicker,
    options: { "include-current": true },
  },
  {
    name: "current",
    displayName: t`Current`,
    init: filter => getCurrentDateFilter(filter),
    test: filter => isCurrentDateFilter(filter),
    group: "relative",
    widget: CurrentPicker,
  },
  {
    name: "next",
    displayName: t`Next`,
    init: filter => getNextDateFilter(filter),
    test: filter => isNextDateFilter(filter),
    group: "relative",
    widget: NextPicker,
    options: { "include-current": true },
  },
  {
    name: "between",
    displayName: t`Between`,
    init: filter => getBetweenDateFilter(filter),
    test: filter => isBetweenFilter(filter),
    group: "specific",
    widget: BetweenPicker,
  },
  {
    name: "before",
    displayName: t`Before`,
    init: filter => getBeforeDateFilter(filter),
    test: filter => isBeforeDateFilter(filter),
    group: "specific",
    widget: BeforePicker,
  },
  {
    name: "on",
    displayName: t`On`,
    init: filter => getOnDateFilter(filter),
    test: filter => isOnDateFilter(filter),
    group: "specific",
    widget: SingleDatePicker,
  },
  {
    name: "after",
    displayName: t`After`,
    init: filter => getAfterDateFilter(filter),
    test: filter => isAfterDateFilter(filter),
    group: "specific",
    widget: AfterPicker,
  },
  {
    name: "exclude",
    displayName: t`Exclude...`,
    displayPrefix: t`Exclude`,
    init: filter => getExcludeDateFilter(filter),
    test: filter => isExcludeDateFilter(filter),
    widget: ExcludeDatePicker,
  },
];

export function getOperator(filter: Filter, operators = DATE_OPERATORS) {
  return _.find(operators, o => o.test(filter));
}

type Props = {
  className?: string;

  filter: Filter;
  dateShortcutOptions?: DateShortcutOptions;
  operators?: DateOperator[];

  hideTimeSelectors?: boolean;
  hideEmptinessOperators?: boolean;
  disableOperatorSelection?: boolean;
  disableChangingDimension?: boolean;
  supportsExpressions?: boolean;

  minWidth?: number | null;
  maxWidth?: number | null;

  onBack?: () => void;
  onCommit: (filter: any[]) => void;
  onFilterChange: (filter: any[]) => void;
};

const DatePicker: React.FC<React.PropsWithChildren<Props>> = props => {
  const {
    className,
    filter,
    dateShortcutOptions,
    onFilterChange,
    disableOperatorSelection,
    disableChangingDimension,
    supportsExpressions,
    onCommit,
    children,
    hideTimeSelectors,
    operators = DATE_OPERATORS,
  } = props;

  const operator = getOperator(filter, operators);
  const [showShortcuts, setShowShortcuts] = React.useState(
    !operator && !disableOperatorSelection,
  );
  const Widget = operator && operator.widget;

  const enableBackButton =
    !disableChangingDimension &&
    ((!showShortcuts && !disableOperatorSelection) ||
      (showShortcuts && props.onBack));
  const onBack = () => {
    if (!operator || showShortcuts) {
      props.onBack?.();
    } else {
      setShowShortcuts(true);
    }
  };

  return (
    <div className={cx(className)} data-testid="date-picker">
      {!operator || showShortcuts ? (
        <DatePickerShortcuts
          className={CS.p2}
          dateShortcutOptions={dateShortcutOptions}
          onFilterChange={filter => {
            setShowShortcuts(false);
            onFilterChange(filter);
          }}
          onCommit={onCommit}
          filter={filter}
          onBack={enableBackButton ? onBack : undefined}
        />
      ) : (
        <>
          {operator && !disableOperatorSelection ? (
            <DatePickerHeader
              filter={filter}
              onBack={onBack}
              operators={operators}
              onFilterChange={onFilterChange}
            />
          ) : null}
          {Widget && (
            <Widget
              {...props}
              className={cx(CS.flexFull, CS.p2)}
              filter={filter}
              onCommit={onCommit}
              supportsExpressions={supportsExpressions}
              onFilterChange={(filter: Filter) => {
                if (!isStartingFrom(filter) && operator && operator.init) {
                  onFilterChange(operator.init(filter));
                } else {
                  onFilterChange(filter);
                }
              }}
            />
          )}
          <DatePickerFooter
            filter={filter}
            onFilterChange={onFilterChange}
            hideTimeSelectors={hideTimeSelectors}
          >
            {children}
          </DatePickerFooter>
        </>
      )}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatePicker;
