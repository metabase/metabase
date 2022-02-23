/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";
import moment from "moment";
import _ from "underscore";

import SpecificDatePicker from "./SpecificDatePicker";
import {
  PickerButton,
  Separator,
  TabContainer,
  TabButton,
} from "./NewDatePicker.styled";
import RelativeDatePicker, { DATE_PERIODS } from "./RelativeDatePicker";

import { FieldDimension } from "metabase-lib/lib/Dimension";

type Filter = any;
type Field = any;

const getIntervals = ([op, field, value, unit]: Filter) =>
  op === "time-interval" && typeof value === "number" ? Math.abs(value) : 30;
const getUnit = ([op, field, value, unit]: Filter) =>
  op === "time-interval" && unit ? unit : "day";
const getOptions = ([op, field, value, unit, options]: Filter) =>
  (op === "time-interval" && options) || {};

const getDate = (value: string | Date) => {
  if (typeof value !== "string" || !moment(value).isValid()) {
    value = moment().format("YYYY-MM-DD");
  }
  return value;
};

const hasTime = (value: string) =>
  typeof value === "string" && /T\d{2}:\d{2}:\d{2}$/.test(value);

function getDateTimeField(field: Field, bucketing?: string) {
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

function getDateTimeFieldAndValues(filter: Filter, count: number) {
  const values = filter
    .slice(2, 2 + count)
    .map((value: any) => value && getDate(value));
  const bucketing = _.any(values, hasTime) ? "minute" : undefined;
  const field = getDateTimeField(filter[1], bucketing);
  return [field, ...values];
}

type Option = {
  displayName: string;
  init: (filter: any) => any[];
};

const DAY_OPTIONS: Option[] = [
  {
    displayName: t`Today`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      1,
      "day",
      { include_current: true },
    ],
  },
  {
    displayName: t`Yesterday`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      1,
      "day",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last Week`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      1,
      "week",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 7 Days`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      7,
      "day",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 30 Days`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      30,
      "day",
      { include_current: false },
    ],
  },
];

const MONTH_OPTIONS: Option[] = [
  {
    displayName: t`Last Month`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      1,
      "month",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 3 Months`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      3,
      "month",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 12 Months`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      12,
      "month",
      { include_current: false },
    ],
  },
];

const MISC_OPTIONS: Option[] = [
  {
    displayName: t`Specific date...`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      1,
      "month",
      { include_current: false },
    ],
  },
  {
    displayName: t`Relative date...`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      3,
      "month",
      { include_current: false },
    ],
  },
  {
    displayName: t`Exclude...`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      12,
      "month",
      { include_current: false },
    ],
  },
];

type Operator = {
  displayName: string;
  init: (filter: Filter) => Filter;
  test: (filter: Filter) => boolean;
  options?: any;
};

export const RELATIVE_OPERATORS: Operator[] = [
  {
    displayName: t`Previous`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      -getIntervals(filter),
      getUnit(filter),
      getOptions(filter),
    ],
    test: ([op, field, value]) =>
      (op === "time-interval" && value < 0) || Object.is(value, -0),
    options: { "include-current": true },
  },
  {
    displayName: t`Next`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      getIntervals(filter),
      getUnit(filter),
      getOptions(filter),
    ],
    test: ([op, field, value]) => op === "time-interval" && value >= 0,
    options: { "include-current": true },
  },
  {
    displayName: t`Current`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      "current",
      getUnit(filter),
    ],
    test: ([op, field, value]) => op === "time-interval" && value === "current",
  },
];

export const SPECIFIC_OPERATORS: Operator[] = [
  {
    displayName: t`Before`,
    init: filter => ["<", ...getDateTimeFieldAndValues(filter, 1)],
    test: ([op]) => op === "<",
  },
  {
    displayName: t`After`,
    init: filter => [">", ...getDateTimeFieldAndValues(filter, 1)],
    test: ([op]) => op === ">",
  },
  {
    displayName: t`On`,
    init: filter => ["=", ...getDateTimeFieldAndValues(filter, 1)],
    test: ([op]) => op === "=",
  },
  {
    displayName: t`Between`,
    init: filter => ["between", ...getDateTimeFieldAndValues(filter, 2)],
    test: ([op]) => op === "between",
  },
];

const isSpecificFilter = ([op]: Filter) =>
  op === "<" || op === ">" || op === "=" || op === "between";
const isRelativeFilter = ([op]: Filter) => op === "time-interval";

export function getOperator(filter: Filter, operators: any[]) {
  return _.find(operators, o => o.test(filter));
}

type Props = {
  primaryColor: string;
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
  className?: string;
  isSidebar?: boolean;
};

function DatePickerMenu({ onFilterChange, filter }: Props) {
  return (
    <>
      {DAY_OPTIONS.map(({ displayName, init }) => (
        <PickerButton
          key={displayName}
          onClick={() => {
            onFilterChange(init(filter));
          }}
        >
          {displayName}
        </PickerButton>
      ))}
      <Separator />
      {MONTH_OPTIONS.map(({ displayName, init }) => (
        <PickerButton
          key={displayName}
          onClick={() => {
            onFilterChange(init(filter));
          }}
        >
          {displayName}
        </PickerButton>
      ))}
      <Separator />
      {MISC_OPTIONS.map(({ displayName, init }) => (
        <PickerButton
          key={displayName}
          onClick={() => {
            onFilterChange(init(filter));
          }}
        >
          {displayName}
        </PickerButton>
      ))}
    </>
  );
}

type TabProps = Props & {
  operators: Operator[];
  showMenu: (value: boolean) => void;
};

function DatePickerTabs({
  operators,
  filter,
  primaryColor,
  onFilterChange,
}: TabProps) {
  return (
    <TabContainer>
      {operators.map(({ test, displayName, init }) => (
        <TabButton
          selected={!!test(filter)}
          primaryColor={primaryColor}
          key={displayName}
          onClick={() => {
            onFilterChange(init(filter));
          }}
        >
          {displayName}
        </TabButton>
      ))}
    </TabContainer>
  );
}

function DatePicker(props: Props) {
  const { className, isSidebar, onFilterChange, filter } = props;
  const [menuVisible, showMenu] = React.useState(false);

  let Widget: any = null;
  let operators: Operator[] | null = null;
  if (isSpecificFilter(filter)) {
    Widget = SpecificDatePicker;
    operators = SPECIFIC_OPERATORS;
  } else if (isRelativeFilter(filter)) {
    Widget = RelativeDatePicker;
    operators = RELATIVE_OPERATORS;
  }

  return (
    <div
      className={cx(className, {
        "PopoverBody--marginBottom": !isSidebar,
      })}
      style={{ minWidth: 300 }}
    >
      {Widget && operators && !menuVisible ? (
        <>
          <DatePickerTabs
            {...props}
            operators={operators}
            showMenu={showMenu}
          />
          <Widget {...props} showMenu={showMenu} />
        </>
      ) : (
        <DatePickerMenu
          {...props}
          onFilterChange={filter => {
            onFilterChange(filter);
            showMenu(false);
          }}
        />
      )}
    </div>
  );
}

export default DatePicker;
