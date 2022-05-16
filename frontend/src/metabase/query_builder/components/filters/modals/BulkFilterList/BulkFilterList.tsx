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
  onRemoveFilter: (filter: Filter) => void;
}

const BulkFilterList = ({
  filters,
  dimensions,
  onRemoveFilter,
}: BulkFilterListProps): JSX.Element => {
  return (
    <ListRoot>
      {dimensions.map((dimension, index) => (
        <BulkFilterListItem
          key={index}
          filters={filters}
          dimension={dimension}
          onRemoveFilter={onRemoveFilter}
        />
      ))}
    </ListRoot>
  );
};

interface BulkFilterListItemProps {
  filters: Filter[];
  dimension: Dimension;
  onRemoveFilter: (filter: Filter) => void;
}

const BulkFilterListItem = ({
  filters,
  dimension,
  onRemoveFilter,
}: BulkFilterListItemProps): JSX.Element => {
  const options = useMemo(() => {
    return filters.filter(f => f.dimension()?.isSameBaseDimension(dimension));
  }, [filters, dimension]);

  return (
    <ListRow>
      <ListRowLabel>{dimension.displayName()}</ListRowLabel>
      <ListRowContent>
        {options.map((filter, index) => (
          <BulkFilterSelect
            key={index}
            filter={filter}
            onRemoveFilter={onRemoveFilter}
          />
        ))}
      </ListRowContent>
    </ListRow>
  );
};

export default BulkFilterList;
