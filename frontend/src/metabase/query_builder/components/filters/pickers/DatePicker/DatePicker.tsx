import React from "react";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import { Root } from "./DatePicker.styled";
import { DatePickerOptionsList } from "./DatePickerOptionsList";
import { OnFilterChange, PredefinedFilterId } from "./constants";
import { getPredefinedFilter } from "./utils";

type Props = {
  filter: Filter;
  onFilterChange: OnFilterChange;
  className?: string;
};

export function DatePicker({ filter, onFilterChange }: Props) {
  const onPredefinedFilterClick = (filterId: PredefinedFilterId) => {
    const { operator, arguments: args } = getPredefinedFilter(filterId);
    const newFilter = filter.setOperator(operator).setArguments(args);
    onFilterChange(newFilter, true);
  };

  const onCustomFilterClick = (filterId: string) => {
    console.log("onCustomFilterClick", filterId);
  };

  return (
    <Root>
      <DatePickerOptionsList
        onPredefinedFilterClick={onPredefinedFilterClick}
        onCustomFilterClick={onCustomFilterClick}
      />
    </Root>
  );
}
