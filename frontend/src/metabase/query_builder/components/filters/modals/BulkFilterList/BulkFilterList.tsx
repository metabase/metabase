import React, { useMemo } from "react";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Dimension from "metabase-lib/lib/Dimension";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import BulkFilterSelect from "../BulkFilterSelect";
import {
  ListRoot,
  ListRow,
  ListRowContent,
  ListRowLabel,
} from "./BulkFilterList.styled";

export interface BulkFilterListProps {
  query: StructuredQuery;
  filters: Filter[];
  dimensions: Dimension[];
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

const BulkFilterList = ({
  query,
  filters,
  dimensions,
  onChangeFilter,
  onRemoveFilter,
}: BulkFilterListProps): JSX.Element => {
  return (
    <ListRoot>
      {dimensions.map((dimension, index) => (
        <BulkFilterListItem
          key={index}
          query={query}
          filters={filters}
          dimension={dimension}
          onChangeFilter={onChangeFilter}
          onRemoveFilter={onRemoveFilter}
        />
      ))}
    </ListRoot>
  );
};

interface BulkFilterListItemProps {
  query: StructuredQuery;
  filters: Filter[];
  dimension: Dimension;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

const BulkFilterListItem = ({
  query,
  filters,
  dimension,
  onChangeFilter,
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
            query={query}
            filter={filter}
            onChangeFilter={onChangeFilter}
            onRemoveFilter={onRemoveFilter}
          />
        ))}
      </ListRowContent>
    </ListRow>
  );
};

export default BulkFilterList;
