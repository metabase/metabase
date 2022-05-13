import React from "react";
import { DimensionOption } from "metabase-lib/lib/queries/StructuredQuery";
import SelectButton from "metabase/core/components/SelectButton";
import {
  ListAction,
  ListLabel,
  ListRoot,
  ListRow,
} from "./BulkFilterList.styled";

export interface BulkFilterListProps {
  options: DimensionOption[];
}

const BulkFilterList = ({ options }: BulkFilterListProps): JSX.Element => {
  return (
    <ListRoot>
      {options.map((option, index) => (
        <ListRow key={index}>
          <ListLabel>{option.dimension.displayName()}</ListLabel>
          <ListAction>
            <SelectButton />
          </ListAction>
        </ListRow>
      ))}
    </ListRoot>
  );
};

export default BulkFilterList;
