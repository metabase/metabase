import * as React from "react";
import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";

import { isStartingFrom } from "metabase-lib/queries/utils/query-time";
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
} from "metabase-lib/queries/utils/date-filters";
import type Filter from "metabase-lib/queries/structured/Filter";

import DatePickerFooter from "./DatePickerFooter";
import DatePickerHeader from "./DatePickerHeader";
import ExcludeDatePicker from "./ExcludeDatePicker";
import DatePickerShortcuts from "./DatePickerShortcuts";
import type { DateShortcutOptions } from "./DatePickerShortcutOptions";
import CurrentPicker from "./CurrentPicker";
import { NextPicker, PastPicker } from "./RelativeDatePicker";
import { AfterPicker, BeforePicker, BetweenPicker } from "./RangeDatePicker";
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
    displayName: t`Past`,
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

  primaryColor?: string;
  minWidth?: number | null;
  maxWidth?: number | null;

  onBack?: () => void;
  onCommit: (filter: any[]) => void;
  onFilterChange: (filter: any[]) => void;
};

const DatePicker: React.FC<Props> = props => {
  const {
    className,
    filter,
    dateShortcutOptions,
    onFilterChange,
    disableOperatorSelection,
    disableChangingDimension,
    supportsExpressions,
    primaryColor,
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
          className="p2"
          primaryColor={primaryColor}
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
              primaryColor={primaryColor}
              onFilterChange={onFilterChange}
            />
          ) : null}
          {Widget && (
            <Widget
              {...props}
              className="flex-full p2"
              filter={filter}
              onCommit={onCommit}
              primaryColor={primaryColor}
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
            primaryColor={primaryColor}
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
