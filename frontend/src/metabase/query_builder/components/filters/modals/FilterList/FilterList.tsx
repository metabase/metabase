import React from "react";
import { FieldLabel, FieldRow } from "./FilterList.styled";
import { DimensionOption } from "metabase-lib/lib/queries/StructuredQuery";

export interface FilterListProps {
  options: DimensionOption[];
}

const FilterList = ({ options }: FilterListProps): JSX.Element => {
  return (
    <div>
      {options.map((option, index) => (
        <FieldRow key={index}>
          <FieldLabel>{option.dimension.displayName()}</FieldLabel>
        </FieldRow>
      ))}
    </div>
  );
};

export default FilterList;
