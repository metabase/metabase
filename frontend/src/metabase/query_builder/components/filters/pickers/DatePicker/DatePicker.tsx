/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import cx from "classnames";
import moment from "moment";
import _ from "underscore";

import { FieldDimension } from "metabase-lib/lib/Dimension";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import {
  updateRelativeDatetimeFilter,
  isRelativeDatetime,
  isStartingFrom,
  getRelativeDatetimeInterval,
  getRelativeDatetimeField,
  getTimeComponent,
  setTimeComponent,
} from "metabase/lib/query_time";

import DatePickerFooter from "./DatePickerFooter";
import DatePickerHeader from "./DatePickerHeader";
import ExcludeDatePicker from "./ExcludeDatePicker";
import DatePickerShortcuts from "./DatePickerShortcuts";
import { DateShortcutOptions } from "./DatePickerShortcutOptions";
import CurrentPicker from "./CurrentPicker";
import { NextPicker, PastPicker } from "./RelativeDatePicker";
import { AfterPicker, BeforePicker, BetweenPicker } from "./RangeDatePicker";
import SingleDatePicker from "./SingleDatePicker";

const getIntervals = ([op, _field, value, _unit]: Filter) =>
  op === "time-interval" && typeof value === "number" ? Math.abs(value) : 30;
const getUnit = ([op, _field, _value, unit]: Filter) => {
  const result = op === "time-interval" && unit ? unit : "day";
  return result;
};
const getOptions = ([op, _field, _value, _unit, options]: Filter) =>
  (op === "time-interval" && options) || {};

const getDate = (value: string): string => {
  if (typeof value !== "string" || !moment(value).isValid()) {
    value = moment().format("YYYY-MM-DD");
  }
  // Relative date shortcut sets unit to "none" to avoid preselecting
  if (value === "none") {
    return "day";
  }
  return value;
};

const hasTime = (value: unknown) =>
  typeof value === "string" && /T\d{2}:\d{2}:\d{2}$/.test(value);

/**
 * Returns MBQL :field clause with temporal bucketing applied.
 * @deprecated -- just use FieldDimension to do this stuff.
 */
function getDateTimeField(filter: any, bucketing?: string | null) {
  let dimension = filter?.dimension?.();
  if (!dimension) {
    dimension = FieldDimension.parseMBQLOrWarn(
      getRelativeDatetimeField(filter),
    );
  }
  if (dimension) {
    if (bucketing) {
      return dimension.withTemporalUnit(bucketing).mbql();
    } else {
      return dimension.withoutTemporalBucketing().mbql();
    }
  }
  return null;
}

export function getDateTimeFieldTarget(field: any[]) {
  const dimension = FieldDimension.parseMBQLOrWarn(field);
  if (dimension && dimension.temporalUnit()) {
    return dimension.withoutTemporalBucketing().mbql() as any;
  } else {
    return field;
  }
}

// add temporal-unit to fields if any of them have a time component
function getDateTimeFieldAndValues(filter: Filter, count: number) {
  let values = filter.slice(2, 2 + count).map(value => value && getDate(value));
  const bucketing = _.any(values, hasTime) ? "minute" : null;
  const field = getDateTimeField(filter, bucketing);
  const { hours, minutes } = getTimeComponent(values[0]);
  if (
    typeof hours === "number" &&
    typeof minutes === "number" &&
    values.length === 2
  ) {
    const { hours: otherHours, minutes: otherMinutes } = getTimeComponent(
      values[1],
    );
    if (typeof otherHours !== "number" || typeof otherMinutes !== "number") {
      values = [
        values[0],
        setTimeComponent(values[1], hours, minutes) || values[0],
      ];
    }
  }
  return [field, ...values.filter(value => value !== undefined)];
}

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
    test: ([op, _field, left, right]) =>
      op === "between" &&
      !isRelativeDatetime(left) &&
      !isRelativeDatetime(right),
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

  const operator = getOperator(props.filter, operators);
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

export default DatePicker;
