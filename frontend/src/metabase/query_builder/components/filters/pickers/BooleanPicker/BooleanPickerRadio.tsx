import { useMemo } from "react";
import { t } from "ttag";

import * as ML from "metabase-lib";
import { Radio } from "metabase/ui";

import { useToggle } from "metabase/hooks/use-toggle";
import { toLegacyFilter, getOperatorsMap } from "metabase-lib/compat";
import type Filter from "metabase-lib/queries/structured/Filter";

import { RadioContainer, Toggle } from "./BooleanPicker.styled";
import { isBooleanValue } from "./utils";

interface BooleanPickerProps {
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
  className?: string;
}

export function BooleanPickerRadio({
  filter: legacyFilter,
  className,
  onFilterChange,
}: BooleanPickerProps) {
  const { filterClause, query, legacyQuery, column, stageIndex } =
    legacyFilter.getMLv2FilterClause();

  const {
    args: [value],
    operator,
  } = ML.filterParts(query, stageIndex, filterClause);

  const operatorName = ML.displayInfo(query, stageIndex, operator)?.shortName;

  const [isExpanded, { toggle }] = useToggle(!isBooleanValue(String(value)));

  const operatorsMap = useMemo(
    () => getOperatorsMap(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const filterOptions = useMemo(
    () => [
      {
        name: t`True`,
        value: "true",
        filter: ML.filterClause(operatorsMap["="], column, [true]),
      },
      {
        name: t`False`,
        value: "false",
        filter: ML.filterClause(operatorsMap["="], column, [false]),
      },
      {
        name: t`Empty`,
        value: "is-null",
        filter: ML.filterClause(operatorsMap["is-null"], column),
      },
      {
        name: t`Not empty`,
        value: "not-null",
        filter: ML.filterClause(operatorsMap["not-null"], column),
      },
    ],
    [operatorsMap, column],
  );

  const filterOptionsMap = Object.fromEntries(
    filterOptions.map(({ value, filter }) => [value, filter]),
  );

  const inputOptions = isExpanded
    ? Object.values(filterOptions)
    : Object.values(filterOptions).slice(0, 2);

  const displayValue = String(value ?? operatorName);

  const updateFilter = (
    optionName: "true" | "false" | "is-null" | "not-null",
  ) => {
    const newFilterClause = filterOptionsMap[optionName];
    onFilterChange(
      toLegacyFilter(query, stageIndex, legacyQuery, newFilterClause),
    );
  };

  return (
    <RadioContainer className={className}>
      <Radio.Group value={displayValue} onChange={updateFilter}>
        {inputOptions.map(({ value, name }) => (
          <Radio key={name} value={value} label={name} pb={6} size="xs" />
        ))}
      </Radio.Group>
      {!isExpanded && <Toggle onClick={toggle} />}
    </RadioContainer>
  );
}
