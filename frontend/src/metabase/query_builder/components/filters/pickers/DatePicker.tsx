/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { t } from "ttag";
import cx from "classnames";
import moment from "moment";
import _ from "underscore";

import {
  AfterPicker,
  BeforePicker,
  BetweenPicker,
  SingleDatePicker,
} from "./SpecificDatePicker";
import { CurrentPicker, NextPicker, PastPicker } from "./RelativeDatePicker";

import { FieldDimension } from "metabase-lib/lib/Dimension";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { shouldHidePopoverFooter } from "../FilterPopoverFooter";
import ExcludeDatePicker from "./ExcludeDatePicker";

const getIntervals = ([op, _field, value, _unit]: Filter) =>
  op === "time-interval" && typeof value === "number" ? Math.abs(value) : 30;
const getUnit = ([op, _field, _value, unit]: Filter) =>
  op === "time-interval" && unit ? unit : "day";
const getOptions = ([op, _field, _value, _unit, options]: Filter) =>
  (op === "time-interval" && options) || {};

const getDate = (value: string): string => {
  if (typeof value !== "string" || !moment(value).isValid()) {
    value = moment().format("YYYY-MM-DD");
  }
  return value;
};

const hasTime = (value: unknown) =>
  typeof value === "string" && /T\d{2}:\d{2}:\d{2}$/.test(value);

/**
 * Returns MBQL :field clause with temporal bucketing applied.
 * @deprecated -- just use FieldDimension to do this stuff.
 */
function getDateTimeField(field: any[], bucketing?: string | null) {
  const dimension = FieldDimension.parseMBQLOrWarn(field);
  if (dimension) {
    if (bucketing) {
      return dimension.withTemporalUnit(bucketing).mbql();
    } else {
      return dimension.withoutTemporalBucketing().mbql();
    }
  }
  return field;
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
  const values = filter
    .slice(2, 2 + count)
    .map(value => value && getDate(value));
  const bucketing = _.any(values, hasTime) ? "minute" : null;
  const field = getDateTimeField(filter[1], bucketing);
  return [field, ...values];
}

export type DateOperatorGroup = "relative" | "specific";

export type DateOperator = {
  name: string;
  displayName: string;
  init: (filter: Filter) => any[];
  test: (filter: Filter) => boolean;
  widget: any;
  group?: DateOperatorGroup;
  options?: any;
};

export const DATE_OPERATORS: DateOperator[] = [
  {
    name: "previous",
    displayName: t`Past`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      -getIntervals(filter),
      getUnit(filter),
      getOptions(filter),
    ],
    test: ([op, field, value]) =>
      (op === "time-interval" && value < 0) || Object.is(value, -0),
    group: "relative",
    widget: PastPicker,
    options: { "include-current": true },
  },
  {
    name: "current",
    displayName: t`Current`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      "current",
      getUnit(filter),
    ],
    test: ([op, field, value]) => op === "time-interval" && value === "current",
    group: "relative",
    widget: CurrentPicker,
  },
  {
    name: "next",
    displayName: t`Next`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      getIntervals(filter),
      getUnit(filter),
      getOptions(filter),
    ],
    test: ([op, field, value]) => op === "time-interval" && value >= 0,
    group: "relative",
    widget: NextPicker,
    options: { "include-current": true },
  },
  {
    name: "between",
    displayName: t`Between`,
    init: filter => ["between", ...getDateTimeFieldAndValues(filter, 2)],
    test: ([op]) => op === "between",
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
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  className?: string;
  hideEmptinessOperators?: boolean;
  isNew?: boolean;
  isSidebar?: boolean;
  operators?: DateOperator[];
  disableOperatorSelection?: boolean;
  primaryColor?: string;
  minWidth?: number | null;
  maxWidth?: number | null;
  onCommit: (filter: any[]) => void;
};

type State = {
  operators: DateOperator[];
};

export default class DatePicker extends Component<Props, State> {
  state = {
    operators: [],
  };

  static propTypes = {};

  UNSAFE_componentWillMount() {
    const operators = this.props.operators || DATE_OPERATORS;

    const operator = getOperator(this.props.filter, operators) || operators[0];
    this.props.onFilterChange(operator.init(this.props.filter));

    this.setState({ operators });
  }

  render() {
    const {
      className,
      filter,
      onFilterChange,
      isSidebar,
      minWidth,
      maxWidth,
      primaryColor,
    } = this.props;

    const { operators } = this.state;

    const operator = getOperator(this.props.filter, operators);
    const Widget = operator && operator.widget;

    return (
      <div
        // apply flex to align the operator selector and the "Widget" if necessary
        className={cx(className, {
          "flex align-center": Widget && Widget.horizontalLayout,
          "PopoverBody--marginBottom":
            !isSidebar && !shouldHidePopoverFooter(filter),
        })}
        style={{ minWidth: minWidth || 300, maxWidth: maxWidth || undefined }}
      >
        {Widget && (
          <Widget
            {...this.props}
            className="flex-full"
            filter={filter}
            primaryColor={primaryColor}
            onFilterChange={(filter: Filter) => {
              if (operator && operator.init) {
                onFilterChange(operator.init(filter));
              } else {
                onFilterChange(filter);
              }
            }}
          />
        )}
      </div>
    );
  }
}
