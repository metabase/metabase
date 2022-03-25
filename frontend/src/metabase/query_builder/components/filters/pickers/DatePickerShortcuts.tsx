/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";
import moment from "moment";
import _ from "underscore";

import { ShortcutButton, Separator } from "./DatePickerShortcuts.styled";

import { FieldDimension } from "metabase-lib/lib/Dimension";
import { Field } from "metabase-types/types/Field";
import Filter from "metabase-lib/lib/queries/structured/Filter";

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
      -1,
      "day",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last Week`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      -1,
      "week",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 7 Days`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      -7,
      "day",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 30 Days`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      -30,
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
      -1,
      "month",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 3 Months`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      -3,
      "month",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 12 Months`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      -12,
      "month",
      { include_current: false },
    ],
  },
];

const MISC_OPTIONS: Option[] = [
  {
    displayName: t`Specific date...`,
    init: filter => [
      "=",
      getDateTimeField(filter[1]),
      moment().format("YYYY-MM-DD"),
    ],
  },
  {
    displayName: t`Relative date...`,
    init: filter => ["time-interval", getDateTimeField(filter[1]), "current"],
  },
  {
    displayName: t`Exclude...`,
    init: filter => ["!=", getDateTimeField(filter[1], "day"), 1],
  },
];

type Props = {
  primaryColor?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  onCommit: (value: any[]) => void;
  className?: string;
};

export default function DatePickerShortcuts({
  className,
  onFilterChange,
  filter,
  onCommit,
}: Props) {
  return (
    <div className={className}>
      {DAY_OPTIONS.map(({ displayName, init }) => (
        <ShortcutButton
          key={displayName}
          onClick={() => {
            onCommit(init(filter));
          }}
        >
          {displayName}
        </ShortcutButton>
      ))}
      <Separator />
      {MONTH_OPTIONS.map(({ displayName, init }) => (
        <ShortcutButton
          key={displayName}
          onClick={() => {
            onCommit(init(filter));
          }}
        >
          {displayName}
        </ShortcutButton>
      ))}
      <Separator />
      {MISC_OPTIONS.map(({ displayName, init }) => (
        <ShortcutButton
          key={displayName}
          onClick={() => {
            onFilterChange(init(filter));
          }}
        >
          {displayName}
        </ShortcutButton>
      ))}
    </div>
  );
}
