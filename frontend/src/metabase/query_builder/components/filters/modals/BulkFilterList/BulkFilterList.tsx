import React from "react";
import { DimensionOption } from "metabase-lib/lib/queries/StructuredQuery";
import BulkFilterSelect from "../BulkFilterSelect";
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
            <BulkFilterSelect />
          </ListAction>
        </ListRow>
      ))}
    </ListRoot>
  );
};

export default BulkFilterList;
