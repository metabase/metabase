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
import ExcludeDatePicker from "./ExcludeDatePicker";
import {
  getRelativeDatetimeDimension,
  updateRelativeDatetimeFilter,
  isRelativeDatetime,
  isStartingFrom,
  getRelativeDatetimeInterval,
} from "metabase/lib/query_time";
import DatePickerFooter from "./DatePickerFooter";
import DatePickerHeader from "./DatePickerHeader";
import DatePickerShortcuts from "./DatePickerShortcuts";

const getIntervals = ([op, _field, value, _unit]: Filter) =>
  op === "time-interval" && typeof value === "number" ? Math.abs(value) : 30;
const getUnit = (
  [op, _field, _value, unit]: Filter,
  ignoreNone: boolean = true,
) => {
  const result = op === "time-interval" && unit ? unit : "day";
  return !ignoreNone && result === "none" ? "day" : result;
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
function getDateTimeField(filter: any[], bucketing?: string | null) {
  const dimension = getRelativeDatetimeDimension(filter);
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
  const values = filter
    .slice(2, 2 + count)
    .map(value => value && getDate(value));
  const bucketing = _.any(values, hasTime) ? "minute" : null;
  const field = getDateTimeField(filter, bucketing);
  return [field, ...values];
}

export type DatePickerGroup = "relative" | "specific";

export type DateOperator = {
  name: string;
  displayName: string;
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
        getUnit(filter, false),
        getOptions(filter),
      ],
    test: filter => {
      const [op, _field, left] = filter;
      if (op === "time-interval" && left < 0) {
        return true;
      }
      const [value] = getRelativeDatetimeInterval(filter);
      return typeof value === "number" && value < 0;
    },
    group: "relative",
    widget: PastPicker,
    options: { "include-current": true },
  },
  {
    name: "current",
    displayName: t`Current`,
    init: filter => ["time-interval", getDateTimeField(filter[1]), "current"],
    test: ([op, field, value]) => op === "time-interval" && value === "current",
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
        getUnit(filter, false),
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
      const values = ["between", ...getDateTimeFieldAndValues(filter, 2)];
      return values;
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
  hideExcludeOperators?: boolean;
  hideEmptinessOperators?: boolean;
  disableOperatorSelection?: boolean;

  primaryColor?: string;
  minWidth?: number | null;
  maxWidth?: number | null;

  onBack?: () => void;
  onCommit: (filter: any[]) => void;
  onFilterChange: (filter: any[]) => void;
};

type State = {
  operators: DateOperator[];
  showShortcuts: boolean;
};

export default class DatePicker extends Component<Props, State> {
  state = {
    operators: [],
    showShortcuts: false,
  };

  static propTypes = {};

  UNSAFE_componentWillMount() {
    let operators = this.props.operators || DATE_OPERATORS;
    if (this.props.hideExcludeOperators) {
      operators = operators.filter(op => op.name !== "exclude");
    }

    this.setState({
      operators,
      showShortcuts: !this.props.filter?.isValid?.(),
    });
  }

  render() {
    const {
      className,
      filter,
      onFilterChange,
      isSidebar,
      minWidth,
      primaryColor,
      onCommit,
      children,
      hideTimeSelectors,
      hideExcludeOperators,
    } = this.props;

    const { operators, showShortcuts } = this.state;

    const operator = getOperator(this.props.filter, operators);
    const Widget = operator && operator.widget;

    const onBack = () => {
      if (showShortcuts) {
        this.props.onBack?.();
      } else {
        this.setState({ showShortcuts: true });
      }
    };

    return (
      <div className={cx(className)}>
        {!operator || showShortcuts ? (
          <DatePickerShortcuts
            className={"p2"}
            primaryColor={primaryColor}
            onFilterChange={filter => {
              this.setState({ showShortcuts: false });
              onFilterChange(filter);
            }}
            hideExcludeOperators={hideExcludeOperators}
            onCommit={onCommit}
            filter={filter}
          />
        ) : (
          <>
            {operator ? (
              <DatePickerHeader
                filter={filter}
                onBack={onBack}
                operators={operators}
                onFilterChange={onFilterChange}
              />
            ) : null}
            {Widget && (
              <Widget
                {...this.props}
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
  }
}
