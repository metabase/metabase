import React from "react";
import { DimensionOption } from "metabase-lib/lib/queries/StructuredQuery";
import { FilterLabel, FilterListRoot, FilterRow } from "./FilterList.styled";

export interface FilterListProps {
  options: DimensionOption[];
}

const FilterList = ({ options }: FilterListProps): JSX.Element => {
  return (
    <FilterListRoot>
      {options.map((option, index) => (
        <FilterRow key={index}>
          <FilterLabel>{option.dimension.displayName()}</FilterLabel>
        </FilterRow>
      ))}
    </FilterListRoot>
  );
};

export default FilterList;
