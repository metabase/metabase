/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import {
  updateRelativeDatetimeFilter,
  isRelativeDatetime,
  isStartingFrom,
  getRelativeDatetimeInterval,
} from "metabase/lib/query_time";

import DatePickerFooter from "./DatePickerFooter";
import DatePickerHeader from "./DatePickerHeader";
import ExcludeDatePicker from "./ExcludeDatePicker";
import DatePickerShortcuts from "./DatePickerShortcuts";
import { CurrentPicker, NextPicker, PastPicker } from "./RelativeDatePicker";
import { AfterPicker, BeforePicker, BetweenPicker } from "./RangeDatePicker";
import SingleDatePicker from "./SingleDatePicker";
import {
  getDateTimeField,
  getDateTimeFieldAndValues,
  getIntervals,
  getOptions,
  getTemporalUnit,
  getUnit,
} from "./utils";

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
    init: filter =>
      updateRelativeDatetimeFilter(filter, false) || [
        "time-interval",
        getDateTimeField(filter),
        -getIntervals(filter),
        getUnit(filter),
        getOptions(filter),
      ],
    test: filter => {
      const [op, _field, left] = filter;
      if (op === "time-interval" && typeof left === "number" && left <= 0) {
        return true;
      }
      const [value] = getRelativeDatetimeInterval(filter);
      return typeof value === "number" && value <= 0;
    },
    group: "relative",
    widget: PastPicker,
    options: { "include-current": true },
  },
  {
    name: "current",
    displayName: t`Current`,
    init: filter => ["time-interval", getDateTimeField(filter), "current"],
    test: ([op, field, value]) =>
      op === "time-interval" && (value === "current" || value === null),
    group: "relative",
    widget: CurrentPicker,
  },
  {
    name: "next",
    displayName: t`Next`,
    init: filter =>
      updateRelativeDatetimeFilter(filter, true) || [
        "time-interval",
        getDateTimeField(filter),
        getIntervals(filter),
        getUnit(filter),
        getOptions(filter),
      ],
    test: filter => {
      const [op, _field, left] = filter;
      if (op === "time-interval" && left > 0) {
        return true;
      }
      const [value] = getRelativeDatetimeInterval(filter);
      return typeof value === "number" && value > 0;
    },
    group: "relative",
    widget: NextPicker,
    options: { "include-current": true },
  },
  {
    name: "between",
    displayName: t`Between`,
    init: filter => {
      const [field, ...values] = getDateTimeFieldAndValues(filter, 2);
      return ["between", field, ...values];
    },
    test: ([op, field, left, right]) => {
      const isExplicitBetween =
        op === "between" &&
        !isRelativeDatetime(left) &&
        !isRelativeDatetime(right);

      const temporalUnit = getTemporalUnit(field);

      const isImplicitBetween =
        op === "=" && temporalUnit != null && temporalUnit !== "day";
      return isExplicitBetween || isImplicitBetween;
    },
    group: "specific",
    widget: BetweenPicker,
  },
  {
    name: "before",
    displayName: t`Before`,
    init: filter => ["<", ...getDateTimeFieldAndValues(filter, 1)],
    test: ([op]) => op === "<",
    group: "specific",
    widget: BeforePicker,
  },
  {
    name: "on",
    displayName: t`On`,
    init: filter => ["=", ...getDateTimeFieldAndValues(filter, 1)],
    test: ([op]) => op === "=",
    group: "specific",
    widget: SingleDatePicker,
  },
  {
    name: "after",
    displayName: t`After`,
    init: filter => [">", ...getDateTimeFieldAndValues(filter, 1)],
    test: ([op]) => op === ">",
    group: "specific",
    widget: AfterPicker,
  },
  {
    name: "exclude",
    displayName: t`Exclude...`,
    displayPrefix: t`Exclude`,
    init: ([op, field, ...values]) =>
      op === "!=" ? [op, field, ...values] : [op, field],
    test: ([op]) => ["!=", "is-null", "not-null"].indexOf(op) > -1,
    widget: ExcludeDatePicker,
  },
];

export function getOperator(filter: Filter, operators = DATE_OPERATORS) {
  return _.find(operators, o => o.test(filter));
}

type Props = {
  isSidebar?: boolean;
  className?: string;

  filter: Filter;
  operators?: DateOperator[];

  hideTimeSelectors?: boolean;
  hideEmptinessOperators?: boolean;
  disableOperatorSelection?: boolean;

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
    onFilterChange,
    isSidebar,
    disableOperatorSelection,
    primaryColor,
    onCommit,
    children,
    hideTimeSelectors,
    operators = DATE_OPERATORS,
  } = props;

  const operator = getOperator(props.filter, operators);
  const [showShortcuts, setShowShortcuts] = React.useState(
    !operator && !disableOperatorSelection,
  );
  const Widget = operator && operator.widget;

  const enableBackButton =
    (!showShortcuts && !disableOperatorSelection) ||
    (showShortcuts && props.onBack);
  const onBack = () => {
    if (!operator || showShortcuts) {
      props.onBack?.();
    } else {
      setShowShortcuts(true);
    }
  };

  return (
    <div className={cx(className)}>
      {!operator || showShortcuts ? (
        <DatePickerShortcuts
          className={"p2"}
          primaryColor={primaryColor}
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
            isSidebar={isSidebar}
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

export default DatePicker;
