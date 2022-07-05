import React, { useMemo } from "react";
import { t } from "ttag";

import StructuredQuery, {
  DimensionOption,
  SegmentOption,
  isDimensionOption,
  isSegmentOption,
} from "metabase-lib/lib/queries/StructuredQuery";
import Dimension from "metabase-lib/lib/Dimension";
import { ModalDivider } from "../BulkFilterModal/BulkFilterModal.styled";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { BulkFilterItem } from "../BulkFilterItem";
import { SegmentFilterSelect } from "../BulkFilterSelect";
import {
  ListRoot,
  ListRow,
  ListRowLabel,
  FilterDivider,
} from "./BulkFilterList.styled";
import { sortDimensions } from "./utils";

export interface BulkFilterListProps {
  query: StructuredQuery;
  filters: Filter[];
  options: (DimensionOption | SegmentOption)[];
  onAddFilter: (filter: Filter) => void;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
  onClearSegments: () => void;
}

const BulkFilterList = ({
  query,
  filters,
  options,
  onAddFilter,
  onChangeFilter,
  onRemoveFilter,
  onClearSegments,
}: BulkFilterListProps): JSX.Element => {
  const [dimensions, segments] = useMemo(
    () => [
      options.filter(isDimensionOption).sort(sortDimensions),
      options.filter(isSegmentOption),
    ],
    [options],
  );

  return (
    <ListRoot>
      {!!segments.length && (
        <SegmentListItem
          query={query}
          segments={segments}
          onAddFilter={onAddFilter}
          onRemoveFilter={onRemoveFilter}
          onClearSegments={onClearSegments}
        />
      )}
      {dimensions.map(({ dimension }, index) => (
        <BulkFilterListItem
          key={index}
          query={query}
          filters={filters}
          dimension={dimension}
          onAddFilter={onAddFilter}
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
  onAddFilter: (filter: Filter) => void;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

const BulkFilterListItem = ({
  query,
  filters,
  dimension,
  onAddFilter,
  onChangeFilter,
  onRemoveFilter,
}: BulkFilterListItemProps): JSX.Element => {
  const options = useMemo(() => {
    const filtersForThisDimension = filters.filter(f =>
      f.dimension()?.isSameBaseDimension(dimension),
    );
    return filtersForThisDimension.length
      ? filtersForThisDimension
      : [undefined];
  }, [filters, dimension]);

  return (
    <ListRow
      aria-label={`filter-field-${dimension.displayName()}`}
      data-testid="dimension-filter-row"
    >
      {options.map((filter, index) => (
        <>
          <BulkFilterItem
            key={index}
            query={query}
            filter={filter}
            dimension={dimension}
            onAddFilter={onAddFilter}
            onChangeFilter={onChangeFilter}
            onRemoveFilter={onRemoveFilter}
          />
          <FilterDivider />
        </>
      ))}
    </ListRow>
  );
};

interface SegmentListItemProps {
  query: StructuredQuery;
  segments: SegmentOption[];
  onAddFilter: (filter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
  onClearSegments: () => void;
}

const SegmentListItem = ({
  query,
  segments,
  onAddFilter,
  onRemoveFilter,
  onClearSegments,
}: SegmentListItemProps): JSX.Element => (
  <>
    <ListRow
      aria-label="filter-field-Segments"
      data-testid="dimension-filter-row"
    >
      <ListRowLabel>{t`Segments`}</ListRowLabel>
      <SegmentFilterSelect
        query={query}
        segments={segments}
        onAddFilter={onAddFilter}
        onRemoveFilter={onRemoveFilter}
        onClearSegments={onClearSegments}
      />
    </ListRow>
  </>
);

export default BulkFilterList;
