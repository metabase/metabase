import { useContext, useMemo } from "react";

import * as ML from "metabase-lib";
import { Radio } from "metabase/ui";

import { FilterContext } from "metabase/common/context";
import { useToggle } from "metabase/hooks/use-toggle";
import { toLegacyFilter, getOperatorsMap } from "metabase-lib/compat";
import type Filter from "metabase-lib/queries/structured/Filter";

import { RadioContainer, Toggle } from "./BooleanPicker.styled";

import { OPTIONS, EXPANDED_OPTIONS } from "./constants";
import { isBooleanValue } from "./utils";

interface BooleanPickerProps {
  onFilterChange: (filter: Filter) => void;
  className?: string;
}

export function BooleanPickerRadio({
  className,
  onFilterChange,
}: BooleanPickerProps) {
  const { filter, query, legacyQuery, column, stageIndex } =
    useContext(FilterContext);

  const {
    args: [value],
    operator,
  } = filter
    ? ML.filterParts(query as ML.Query, stageIndex, filter)
    : { args: [], operator: undefined };

  const operatorName = operator
    ? ML.displayInfo(query as ML.Query, stageIndex, operator)?.shortName
    : undefined;

  const [isExpanded, { toggle }] = useToggle(!isBooleanValue(String(value)));

  const operatorsMap = useMemo(
    () => getOperatorsMap({ query, stageIndex, column }),
    [column, query, stageIndex],
  );

  if (!query || !legacyQuery || !column) {
    return null;
  }

  const updateFilter = (value: "true" | "false" | "is-null" | "not-null") => {
    const operator = isBooleanValue(value)
      ? operatorsMap["="]
      : operatorsMap[value];

    const filterValue = isBooleanValue(value)
      ? value === "true" // cast string to boolean
      : undefined;

    const newFilterClause = ML.filterClause(operator, column, filterValue);
    onFilterChange(toLegacyFilter(query, legacyQuery, newFilterClause));
  };

  const displayValue = String(value ?? operatorName);

  return (
    <RadioContainer className={className}>
      <Radio.Group value={displayValue} onChange={updateFilter}>
        {(isExpanded ? EXPANDED_OPTIONS : OPTIONS).map(({ value, name }) => (
          <Radio
            key={String(value)}
            value={String(value)}
            label={name}
            pb={6}
            size="xs"
          />
        ))}
      </Radio.Group>
      {!isExpanded && <Toggle onClick={toggle} />}
    </RadioContainer>
  );
}
