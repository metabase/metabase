import React from "react";
import { DimensionOption } from "metabase-lib/lib/queries/StructuredQuery";
import { ListLabel, ListRoot, ListRow } from "./FilterList.styled";

export interface FilterListProps {
  options: DimensionOption[];
}

const FilterList = ({ options }: FilterListProps): JSX.Element => {
  return (
    <ListRoot>
      {options.map((option, index) => (
        <ListRow key={index}>
          <ListLabel>{option.dimension.displayName()}</ListLabel>
        </ListRow>
      ))}
    </ListRoot>
  );
};

export default FilterList;
