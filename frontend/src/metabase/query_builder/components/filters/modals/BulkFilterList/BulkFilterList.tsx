import React, { useMemo } from "react";
import Dimension from "metabase-lib/lib/Dimension";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import BulkFilterSelect from "../BulkFilterSelect";
import {
  ListRowContent,
  ListRowLabel,
  ListRoot,
  ListRow,
} from "./BulkFilterList.styled";

export interface BulkFilterListProps {
  filters: Filter[];
  dimensions: Dimension[];
}

const BulkFilterList = ({
  filters,
  dimensions,
}: BulkFilterListProps): JSX.Element => {
  return (
    <ListRoot>
      {dimensions.map((dimension, index) => (
        <BulkFilterListItem
          key={index}
          filters={filters}
          dimension={dimension}
        />
      ))}
    </ListRoot>
  );
};

interface BulkFilterListItemProps {
  filters: Filter[];
  dimension: Dimension;
}

const BulkFilterListItem = ({
  filters,
  dimension,
}: BulkFilterListItemProps): JSX.Element => {
  const options = useMemo(() => {
    return filters.filter(f => f.dimension()?.isSameBaseDimension(dimension));
  }, [filters, dimension]);

  return (
    <ListRow>
      <ListRowLabel>{dimension.displayName()}</ListRowLabel>
      <ListRowContent>
        {options.map((filter, index) => (
          <BulkFilterSelect key={index} filter={filter} />
        ))}
        {!options.length && <BulkFilterSelect />}
      </ListRowContent>
    </ListRow>
  );
};

export default BulkFilterList;
