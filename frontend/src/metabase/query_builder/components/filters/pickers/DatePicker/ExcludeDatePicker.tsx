import React from "react";
import { t } from "ttag";
import moment from "moment";
import _ from "underscore";

import {
  ExcludeCheckBox,
  ExcludeColumn,
  ExcludeContainer,
  ExcludeLabel,
  OptionButton,
  Separator,
} from "./ExcludeDatePicker.styled";

import { FieldDimension } from "metabase-lib/lib/Dimension";
import { Field } from "metabase-types/types/Field";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { color } from "metabase/lib/colors";
import { EXCLUDE_OPTIONS } from "metabase/lib/query_time";

function getDateTimeField(field: Field, bucketing?: string) {
  const dimension =
    FieldDimension.parseMBQLOrWarn(field) ?? new FieldDimension(null);
  if (bucketing) {
    return dimension.withTemporalUnit(bucketing).mbql();
  } else {
    return dimension.withoutTemporalBucketing().mbql();
  }
}

type Option = {
  displayName: string;
  value: string;
  serialized: string;
  test: (value: string) => boolean;
};

type Group = {
  name: string;
  displayName: string;
  init: (filter: Filter) => any[];
  test: (filter: Filter) => boolean;
  getOptions: () => Option[][];
};

const testTemporalUnit = (unit: string) => (filter: Filter) => {
  const dimension = FieldDimension.parseMBQLOrWarn(filter[1]);
  if (dimension) {
    return dimension.temporalUnit() === unit;
  }
  return filter[1]?.[2]?.["temporal-unit"] === unit;
};

export const EXCLUDE_OPERATORS: Group[] = [
  {
    name: "days",
    displayName: t`Days of the week...`,
    test: testTemporalUnit("day-of-week"),
    init: filter => ["!=", getDateTimeField(filter[1], "day-of-week")],
    getOptions: EXCLUDE_OPTIONS["day-of-week"],
  },
  {
    name: "months",
    displayName: t`Months of the year...`,
    test: testTemporalUnit("month-of-year"),
    init: filter => ["!=", getDateTimeField(filter[1], "month-of-year")],
    getOptions: EXCLUDE_OPTIONS["month-of-year"],
  },
  {
    name: "quarters",
    displayName: t`Quarters of the year...`,
    test: testTemporalUnit("quarter-of-year"),
    init: filter => ["!=", getDateTimeField(filter[1], "quarter-of-year")],
    getOptions: EXCLUDE_OPTIONS["quarter-of-year"],
  },
  {
    name: "hours",
    displayName: t`Hours of the day...`,
    test: testTemporalUnit("hour-of-day"),
    init: filter => ["!=", getDateTimeField(filter[1], "hour-of-day")],
    getOptions: EXCLUDE_OPTIONS["hour-of-day"],
  },
];

export function getHeaderText(filter: Filter) {
  return getExcludeOperator(filter)?.displayName || t`Exclude...`;
}

export function getExcludeOperator(filter: Filter) {
  return _.find(EXCLUDE_OPERATORS, ({ test }) => test(filter));
}

type Props = {
  primaryColor?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  className?: string;
  onCommit: (filter: any[]) => void;
  hideEmptinessOperators?: boolean;
};

export default function ExcludeDatePicker({
  className,
  onFilterChange,
  filter,
  primaryColor = color("brand"),
  onCommit,
  hideEmptinessOperators,
}: Props) {
  const [operator, field, ...values] = filter;
  const temporalUnit = _.find(EXCLUDE_OPERATORS, ({ test }) => test(filter));

  if (!temporalUnit || operator === "is-null" || operator === "not-null") {
    return (
      <div className={className} data-testid="exclude-date-picker">
        {EXCLUDE_OPERATORS.map(({ displayName, init }) => (
          <OptionButton
            key={displayName}
            primaryColor={primaryColor}
            onClick={() => {
              onFilterChange(init(filter));
            }}
          >
            {displayName}
          </OptionButton>
        ))}
        {!hideEmptinessOperators && (
          <>
            <Separator />
            <OptionButton
              selected={operator === "not-null"}
              primaryColor={primaryColor}
              onClick={() => {
                onCommit(["not-null", getDateTimeField(filter[1])]);
              }}
            >
              {t`Is empty`}
            </OptionButton>
            <OptionButton
              selected={operator === "is-null"}
              primaryColor={primaryColor}
              onClick={() => {
                onCommit(["is-null", getDateTimeField(filter[1])]);
              }}
            >
              {t`Is not empty`}
            </OptionButton>
          </>
        )}
      </div>
    );
  }

  const { getOptions } = temporalUnit;
  const options = getOptions();
  const update = (values: string[]) =>
    onFilterChange([operator, field, ...values]);
  const allSelected = values.length === 0;
  const selectAllLabel = allSelected ? t`Select none...` : t`Select all...`;

  return (
    <div className={className}>
      <ExcludeCheckBox
        label={<ExcludeLabel>{selectAllLabel}</ExcludeLabel>}
        checkedColor={primaryColor}
        checked={allSelected}
        onChange={() =>
          update(allSelected ? options.flat().map(({ value }) => value) : [])
        }
      />
      <Separator />
      <ExcludeContainer>
        {options.map((inner, index) => (
          <ExcludeColumn key={index}>
            {inner.map(({ displayName, value, test }) => {
              const checked = !_.find(values, value => test(value));
              return (
                <ExcludeCheckBox
                  key={value}
                  label={<ExcludeLabel>{displayName}</ExcludeLabel>}
                  checked={checked}
                  checkedColor={primaryColor}
                  onChange={() => {
                    if (checked) {
                      update([...values, value]);
                    } else {
                      update(values.filter(value => !test(value)));
                    }
                  }}
                />
              );
            })}
          </ExcludeColumn>
        ))}
      </ExcludeContainer>
    </div>
  );
}
