import React, { useState } from "react";
import cx from "classnames";
import { t } from "ttag";
import DatePicker, {
  DATE_OPERATORS,
  getOperator,
} from "metabase/query_builder/components/filters/pickers/LegacyDatePicker/DatePicker";
import FilterOptions from "metabase/query_builder/components/filters/FilterOptions";
import { generateTimeFilterValuesDescriptions } from "metabase/lib/query_time";
import { dateParameterValueToMBQL } from "metabase/parameters/utils/mbql";
import { Container, Footer, UpdateButton } from "./DateWidget.styled";

// Use a placeholder value as field references are not used in dashboard filters
const noopRef = null;

function getFilterValueSerializer(func: (...args: any[]) => string) {
  return (filter: any[]) => func(filter[2], filter[3], filter[4] || {});
}

const serializersByOperatorName: Record<string, (...args: any[]) => string> = {
  previous: getFilterValueSerializer(
    (value, unit, options = {}) =>
      `past${-value}${unit}s${options["include-current"] ? "~" : ""}`,
  ),
  next: getFilterValueSerializer(
    (value, unit, options = {}) =>
      `next${value}${unit}s${options["include-current"] ? "~" : ""}`,
  ),
  current: getFilterValueSerializer((_, unit) => `this${unit}`),
  before: getFilterValueSerializer(value => `~${value}`),
  after: getFilterValueSerializer(value => `${value}~`),
  on: getFilterValueSerializer(value => `${value}`),
  between: getFilterValueSerializer((from, to) => `${from}~${to}`),
};

function getFilterOperator(filter: any[]) {
  return DATE_OPERATORS.find(op => op.test(filter as any));
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
  "before",
  "after",
  "on",
  "empty",
  "not-empty",
]);

function getFilterTitle(filter: any[]) {
  const desc = generateTimeFilterValuesDescriptions(filter).join(" - ");
  const op = getFilterOperator(filter);
  const prefix =
    op && prefixedOperators.has(op.name) ? `${op.displayName} ` : "";
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

  const commitAndClose = () => {
    setValue(filterToUrlEncoded(filter));
    onClose?.();
  };

  const isValid = () => {
    const filterValues = filter.slice(2);
    return filterValues.every(value => value != null);
  };

  return (
    <Container>
      <DatePicker
        className="m2"
        filter={filter}
        onFilterChange={setFilter}
        hideEmptinessOperators
        hideTimeSelectors
        disableOperatorSelection={disableOperatorSelection}
      />
      <Footer>
        <FilterOptions
          filter={filter}
          onFilterChange={setFilter}
          operator={getOperator(filter)}
        />
        <UpdateButton
          className={cx({
            disabled: !isValid(),
          })}
          onClick={commitAndClose}
        >
          {t`Update filter`}
        </UpdateButton>
      </Footer>
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
