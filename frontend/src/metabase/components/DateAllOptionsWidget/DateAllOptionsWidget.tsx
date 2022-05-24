import React, { useState } from "react";
import { t } from "ttag";
import _ from "underscore";
import cx from "classnames";

import { dateParameterValueToMBQL } from "metabase/parameters/utils/mbql";
import DatePicker, {
  DATE_OPERATORS,
} from "metabase/query_builder/components/filters/pickers/DatePicker/DatePicker";
import {
  generateTimeFilterValuesDescriptions,
  getRelativeDatetimeInterval,
  getStartingFrom,
} from "metabase/lib/query_time";
import { EXCLUDE_OPERATORS } from "metabase/query_builder/components/filters/pickers/DatePicker/ExcludeDatePicker";

import { Container, UpdateButton } from "./DateWidget.styled";

// Use a placeholder value as field references are not used in dashboard filters
const noopRef = null;

function getFilterValueSerializer(func: (...args: any[]) => string) {
  return (filter: any[]) => {
    const startingFrom = getStartingFrom(filter);
    if (startingFrom) {
      const [value, unit] = getRelativeDatetimeInterval(filter);
      return func(value, unit, { startingFrom });
    } else {
      return func(filter[2], filter[3], filter[4] || {});
    }
  };
}

const serializersByOperatorName: Record<string, (...args: any[]) => string> = {
  previous: getFilterValueSerializer((value, unit, options = {}) => {
    if (options.startingFrom) {
      const [fromValue, fromUnit] = options.startingFrom;
      return `past${-value}${unit}s-from-${fromValue}${fromUnit}s`;
    }
    return `past${-value}${unit}s${options["include-current"] ? "~" : ""}`;
  }),
  next: getFilterValueSerializer((value, unit, options = {}) => {
    if (options.startingFrom) {
      const [fromValue, fromUnit] = options.startingFrom;
      return `next${value}${unit}s-from-${-fromValue}${fromUnit}s`;
    }
    return `next${value}${unit}s${options["include-current"] ? "~" : ""}`;
  }),
  current: getFilterValueSerializer((_, unit) => `this${unit}`),
  before: getFilterValueSerializer(value => `~${value}`),
  after: getFilterValueSerializer(value => `${value}~`),
  on: getFilterValueSerializer(value => `${value}`),
  between: getFilterValueSerializer((from, to) => `${from}~${to}`),
  exclude: (filter: any[]) => {
    const [_op, _field, ...values] = filter;
    const operator = getExcludeOperator(filter);
    if (!operator) {
      return "";
    }
    const options = operator
      .getOptions()
      .flat()
      .filter(({ test }) => !!_.find(values, (value: string) => test(value)));
    return `exclude-${operator.name}-${options
      .map(({ serialized }) => serialized)
      .join("-")}`;
  },
};

function getFilterOperator(filter: any[] = []) {
  return DATE_OPERATORS.find(op => op.test(filter as any));
}

function getExcludeOperator(filter: any[] = []) {
  return EXCLUDE_OPERATORS.find(op => op.test(filter as any));
}

function filterToUrlEncoded(filter: any[]) {
  const operator = getFilterOperator(filter);
  if (operator) {
    return serializersByOperatorName[operator.name](filter);
  } else {
    return null;
  }
}

const prefixedOperators = new Set([
  "exclude",
  "before",
  "after",
  "on",
  "empty",
  "not-empty",
]);

function getFilterTitle(filter: any[]) {
  const values = generateTimeFilterValuesDescriptions(filter);
  const desc =
    values.length > 2
      ? t`${values.length} selections`
      : values.join(filter[0] === "!=" ? ", " : " - ");
  const op = getFilterOperator(filter);
  const prefix =
    op && prefixedOperators.has(op.name)
      ? `${op.displayPrefix ?? op.displayName} `
      : "";
  return prefix + desc;
}

interface DateAllOptionsWidgetProps {
  setValue: (value: string | null) => void;
  value?: string;
  onClose: () => void;
  disableOperatorSelection?: boolean;
}

const DateAllOptionsWidget = ({
  setValue,
  onClose,
  disableOperatorSelection,
  value,
}: DateAllOptionsWidgetProps) => {
  const [filter, setFilter] = useState(
    value != null ? dateParameterValueToMBQL(value, noopRef) || [] : [],
  );

  const commitAndClose = (newFilter?: any) => {
    setValue(filterToUrlEncoded(newFilter || filter));
    onClose?.();
  };

  const isValid = () => {
    const filterValues = filter.slice(2);
    return filterValues.every((value: any) => value != null);
  };
  return (
    <Container>
      <DatePicker
        filter={filter as any}
        onFilterChange={setFilter}
        onCommit={commitAndClose}
        hideTimeSelectors
        hideEmptinessOperators
        disableOperatorSelection={disableOperatorSelection}
      >
        <UpdateButton
          className={cx({
            disabled: !isValid(),
          })}
          onClick={() => commitAndClose()}
        >
          {t`Update filter`}
        </UpdateButton>
      </DatePicker>
    </Container>
  );
};

DateAllOptionsWidget.format = (urlEncoded: string) => {
  if (urlEncoded == null) {
    return null;
  }
  const filter = dateParameterValueToMBQL(urlEncoded, noopRef);

  return filter ? getFilterTitle(filter) : null;
};

export default DateAllOptionsWidget;
