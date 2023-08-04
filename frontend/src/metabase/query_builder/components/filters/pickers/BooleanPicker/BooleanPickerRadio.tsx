import _ from "underscore";
import { useContext, useMemo } from "react";

import * as ML from "metabase-lib";

import { FilterContext } from "metabase/common/context";
import { useToggle } from "metabase/hooks/use-toggle";
import Filter from "metabase-lib/queries/structured/Filter";

import { RadioContainer, Toggle, FilterRadio } from "./BooleanPicker.styled";

import { OPTIONS, EXPANDED_OPTIONS } from "./constants";


interface BooleanPickerProps {
  onFilterChange: (filter: Filter) => void;
  className?: string;
}

function BooleanPicker({
  className,
  onFilterChange,
}: BooleanPickerProps) {
  const { filter, query, legacyQuery, column, stageIndex } = useContext(FilterContext);

  const { args } = filter ? ML.externalOp(filter) : { args: [] };

  const value = args[1];

  const [isExpanded, { toggle }] = useToggle(!_.isBoolean(value));

  const operatorsMap = useMemo(() => {
    if (!query || !legacyQuery || !column) {
      return {};
    }
    const operators = ML.filterableColumnOperators(column);

    return Object.fromEntries(
      operators.map((operator: ML.FilterOperator) => [
        ML.displayInfo(query, stageIndex, operator).shortName,
        operator,
      ]),
    );
  }, [column, query]);

  if (!query || !legacyQuery || !column) {
    return null;
  }

  const updateFilter = (value: unknown) => {
    const operator = _.isBoolean(value)
      ? operatorsMap["="]
      : operatorsMap[value];
    const filterValue = _.isBoolean(value) ? value : undefined;

    const newFilterClause = ML.filterClause(operator, column, filterValue);
    onFilterChange(ML.toLegacyFilter(query, legacyQuery, newFilterClause));
  };

  return (
    <RadioContainer className={className}>
      <FilterRadio
        vertical
        colorScheme="accent7"
        options={isExpanded ? EXPANDED_OPTIONS : OPTIONS}
        value={value}
        onChange={updateFilter}
      />
      {!isExpanded && <Toggle onClick={toggle} />}
    </RadioContainer>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default BooleanPicker;
