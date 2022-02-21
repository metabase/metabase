/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";
import moment from "moment";
import _ from "underscore";

import SpecificDatePicker from "./SpecificDatePicker";
import { PickerButton, Separator } from "./NewDatePicker.styled";
import RelativeDatePicker, { DATE_PERIODS } from "./RelativeDatePicker";

import { FieldDimension } from "metabase-lib/lib/Dimension";

type Filter = any;
type Field = any;

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
  test: (filter: any) => boolean;
  widget: React.ReactNode;
};

export const DATE_OPERATORS: Operator[] = [
  {
    test: ([op]) => op === "<" || op === ">" || op === "=" || op === "between",
    widget: SpecificDatePicker,
  },
  {
    test: ([op]) => op === "time-interval",
    widget: RelativeDatePicker,
  },
];

export function getOperator(filter: Filter) {
  return _.find(DATE_OPERATORS, o => o.test(filter));
}

type Props = {
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

function DatePicker(props: Props) {
  const { className, isSidebar, onFilterChange, filter } = props;
  const [menuVisible, showMenu] = React.useState(false);

  const operator = getOperator(filter);
  const Widget: any = operator && operator.widget;

  return (
    <div
      className={cx(className, {
        "PopoverBody--marginBottom": !isSidebar,
      })}
      style={{ minWidth: 300 }}
    >
      {Widget && !menuVisible ? (
        <Widget {...props} showMenu={showMenu} />
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
