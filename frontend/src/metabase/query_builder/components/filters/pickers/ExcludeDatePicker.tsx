/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";
import moment from "moment";
import _ from "underscore";

import {
  ExcludeCheckBox,
  ExcludeLabel,
  OptionButton,
  Separator,
} from "./ExcludeDatePicker.styled";

import { FieldDimension } from "metabase-lib/lib/Dimension";
import { Field } from "metabase-types/types/Field";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { color } from "metabase/lib/colors";

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
  value: string;
  test: (value: string) => boolean;
};

type Group = {
  displayName: string;
  init: (filter: Filter) => any[];
  test: (filter: Filter) => boolean;
  getOptions: () => Option[];
  twoColumns?: boolean;
};

const testTemporalUnit = (unit: string) => (filter: Filter) => {
  const dimension = FieldDimension.parseMBQLOrWarn(filter[1]);
  if (dimension) {
    return dimension.temporalUnit() === unit;
  }
  return false;
};

const EXCLUDE: Group[] = [
  {
    displayName: t`Days of the week...`,
    test: testTemporalUnit("day-of-week"),
    init: filter => ["!=", getDateTimeField(filter[1], "day-of-week")],
    getOptions: () => {
      const now = moment();
      return _.range(0, 7).map(day => {
        // We increment day here because 0 = Sunday in Memento
        const date = now.day(day + 1);
        const displayName = date.format("dddd");
        return {
          displayName,
          value: date.toISOString(),
          test: value => moment(value).format("dddd") === displayName,
        };
      });
    },
  },
  {
    displayName: t`Months of the year...`,
    test: testTemporalUnit("month-of-year"),
    init: filter => ["!=", getDateTimeField(filter[1], "month-of-year")],
    getOptions: () => {
      const now = moment();
      return _.range(0, 12).map(month => {
        const date = now.month(month);
        const displayName = date.format("MMMM");
        return {
          displayName,
          value: date.toISOString(),
          test: value => moment(value).format("MMMM") === displayName,
        };
      });
    },
    twoColumns: true,
  },
  {
    displayName: t`Quarters of the year...`,
    test: testTemporalUnit("quarter-of-year"),
    init: filter => ["!=", getDateTimeField(filter[1], "quarter-of-year")],
    getOptions: () => {
      const now = moment();
      const suffix = " " + t`quarter`;
      return _.range(1, 5).map(quarter => {
        const date = now.quarter(quarter);

        const displayName = date.format("Qo") + suffix;
        return {
          displayName,
          value: date.toISOString(),
          test: value => moment(value).format("Qo") + suffix === displayName,
        };
      });
    },
  },
  {
    displayName: t`Hours of the day...`,
    test: testTemporalUnit("hour-of-day"),
    init: filter => ["!=", getDateTimeField(filter[1], "hour-of-day")],
    getOptions: () => {
      const now = moment();
      return _.range(0, 24).map(hour => {
        const date = now.hour(hour);
        const displayName = date.format("h A");
        return {
          displayName,
          value: date.toISOString(),
          test: value => moment(value).format("h A") === displayName,
        };
      });
    },
    twoColumns: true,
  },
];

export function getHeaderText(filter: Filter) {
  return getExcludeOperator(filter)?.displayName || t`Exclude...`;
}

export function getExcludeOperator(filter: Filter) {
  return _.find(EXCLUDE, ({ test }) => test(filter));
}

type Props = {
  primaryColor?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  className?: string;
  onCommit: (filter: any[]) => void;
};

export default function ExcludeDatePicker({
  className,
  onFilterChange,
  filter,
  primaryColor = color("brand"),
  onCommit,
}: Props) {
  const [operator, field, ...values] = filter;
  const temporalUnit = _.find(EXCLUDE, ({ test }) => test(filter));

  if (!temporalUnit || operator === "is-null" || operator === "not-null") {
    return (
      <div className={className}>
        {EXCLUDE.map(({ displayName, init }) => (
          <OptionButton
            key={displayName}
            onClick={() => {
              onFilterChange(init(filter));
            }}
          >
            {displayName}
          </OptionButton>
        ))}
        <Separator />
        <OptionButton
          selected={operator === "is-null"}
          primaryColor={primaryColor}
          onClick={() => {
            console.log(">>>>", ["is-null", getDateTimeField(filter[1])]);
            onCommit(["is-null", getDateTimeField(filter[1])]);
          }}
        >
          {t`Is empty`}
        </OptionButton>
        <OptionButton
          selected={operator === "not-null"}
          primaryColor={primaryColor}
          onClick={() => {
            onCommit(["not-null", getDateTimeField(filter[1])]);
          }}
        >
          {t`Is not empty`}
        </OptionButton>
      </div>
    );
  }

  const { getOptions } = temporalUnit;
  const options = getOptions();
  const update = (values: string[]) =>
    onFilterChange([operator, field, ...values]);
  const allSelected = options.length === values.length;
  const selectAllLabel = allSelected ? t`Select none...` : t`Select all...`;

  return (
    <div className={className}>
      <ExcludeCheckBox
        label={<ExcludeLabel>{selectAllLabel}</ExcludeLabel>}
        checked={allSelected}
        onChange={() =>
          update(allSelected ? [] : options.map(({ value }) => value))
        }
      />
      <Separator />
      {options.map(({ displayName, value, test }) => {
        const checked = !!_.find(values, value => test(value));
        return (
          <ExcludeCheckBox
            key={value}
            label={<ExcludeLabel>{displayName}</ExcludeLabel>}
            checked={checked}
            checkedColor={primaryColor}
            onChange={() => {
              if (checked) {
                update(values.filter(value => !test(value)));
              } else {
                update([...values, value]);
              }
            }}
          />
        );
      })}
    </div>
  );
}
