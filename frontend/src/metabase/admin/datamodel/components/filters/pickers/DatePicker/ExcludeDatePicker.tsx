import { t } from "ttag";
import _ from "underscore";

import { color } from "metabase/lib/colors";
import type { FilterMBQL } from "metabase-lib/v1/queries/structured/Filter";
import {
  getInitialDayOfWeekFilter,
  getInitialHourOfDayFilter,
  getInitialMonthOfYearFilter,
  getInitialQuarterOfYearFilter,
  getIsNullDateFilter,
  getNotNullDateFilter,
  isDayOfWeekDateFilter,
  isHourOfDayDateFilter,
  isMonthOfYearDateFilter,
  isQuarterofYearDateFilter,
} from "metabase-lib/v1/queries/utils/date-filters";
import { EXCLUDE_OPTIONS } from "metabase-lib/v1/queries/utils/query-time";

import {
  ExcludeCheckBox,
  ExcludeColumn,
  ExcludeContainer,
  ExcludeLabel,
  OptionButton,
  Separator,
} from "./ExcludeDatePicker.styled";

type Option = {
  displayName: string;
  value: string;
  serialized: string;
  test: (value: string) => boolean;
};

type Group = {
  name: string;
  displayName: string;
  init: (filter: FilterMBQL) => any[];
  test: (filter: FilterMBQL) => boolean;
  getOptionGroups: () => Option[][];
};

export const EXCLUDE_OPERATORS: Group[] = [
  {
    name: "days",
    displayName: t`Days of the week...`,
    test: filter => isDayOfWeekDateFilter(filter),
    init: filter => getInitialDayOfWeekFilter(filter),
    getOptionGroups: EXCLUDE_OPTIONS["day-of-week"],
  },
  {
    name: "months",
    displayName: t`Months of the year...`,
    test: filter => isMonthOfYearDateFilter(filter),
    init: filter => getInitialMonthOfYearFilter(filter),
    getOptionGroups: EXCLUDE_OPTIONS["month-of-year"],
  },
  {
    name: "quarters",
    displayName: t`Quarters of the year...`,
    test: filter => isQuarterofYearDateFilter(filter),
    init: filter => getInitialQuarterOfYearFilter(filter),
    getOptionGroups: EXCLUDE_OPTIONS["quarter-of-year"],
  },
  {
    name: "hours",
    displayName: t`Hours of the day...`,
    test: filter => isHourOfDayDateFilter(filter),
    init: filter => getInitialHourOfDayFilter(filter),
    getOptionGroups: EXCLUDE_OPTIONS["hour-of-day"],
  },
];

export function getHeaderText(filter: FilterMBQL) {
  return getExcludeOperator(filter)?.displayName || t`Exclude...`;
}

export function getExcludeOperator(filter: FilterMBQL) {
  return _.find(EXCLUDE_OPERATORS, ({ test }) => test(filter));
}

type Props = {
  primaryColor?: string;
  filter: FilterMBQL;
  onFilterChange: (filter: any[]) => void;
  className?: string;
  onCommit: (filter: any[]) => void;
  hideEmptinessOperators?: boolean;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
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
                onCommit(getNotNullDateFilter(filter));
              }}
            >
              {t`Is empty`}
            </OptionButton>
            <OptionButton
              selected={operator === "is-null"}
              primaryColor={primaryColor}
              onClick={() => {
                onCommit(getIsNullDateFilter(filter));
              }}
            >
              {t`Is not empty`}
            </OptionButton>
          </>
        )}
      </div>
    );
  }

  const { getOptionGroups } = temporalUnit;
  const optionGroups = getOptionGroups();
  const options = optionGroups.flat();
  const update = (values: string[]) =>
    onFilterChange([operator, field, ...values]);
  const allSelected = values.length === options.length;
  const selectAllLabel = allSelected ? t`Select none` : t`Select all`;

  return (
    <div className={className}>
      <ExcludeCheckBox
        label={<ExcludeLabel>{selectAllLabel}</ExcludeLabel>}
        checkedColor={primaryColor}
        checked={allSelected}
        onChange={() =>
          update(allSelected ? [] : options.map(({ value }) => value))
        }
      />
      <Separator />
      <ExcludeContainer>
        {optionGroups.map((inner, index) => (
          <ExcludeColumn key={index}>
            {inner.map(({ displayName, value, test }) => {
              const isValueExcluded = values.find(value => test(value)) != null;
              return (
                <ExcludeCheckBox
                  key={value}
                  label={<ExcludeLabel>{displayName}</ExcludeLabel>}
                  checked={isValueExcluded}
                  checkedColor={primaryColor}
                  onChange={() => {
                    if (!isValueExcluded) {
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
