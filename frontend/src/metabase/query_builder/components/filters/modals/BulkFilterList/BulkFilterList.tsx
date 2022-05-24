import React, { useMemo } from "react";
import { t } from "ttag";

import StructuredQuery, {
  DimensionOption,
  SegmentOption,
  isDimensionOption,
  isSegmentOption,
} from "metabase-lib/lib/queries/StructuredQuery";
import Dimension from "metabase-lib/lib/Dimension";
import { isSegment } from "metabase/lib/query/filter";
import { ModalDivider } from "../BulkFilterModal/BulkFilterModal.styled";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { BulkFilterSelect, SegmentFilterSelect } from "../BulkFilterSelect";
import {
  ListRoot,
  ListRow,
  ListRowContent,
  ListRowLabel,
} from "./BulkFilterList.styled";

export interface BulkFilterListProps {
  query: StructuredQuery;
  filters: Filter[];
  options: (DimensionOption | SegmentOption)[];
  onAddFilter: (filter: Filter) => void;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

const BulkFilterList = ({
  query,
  filters,
  options,
  onAddFilter,
  onChangeFilter,
  onRemoveFilter,
}: BulkFilterListProps): JSX.Element => {
  const [dimensions, segments, segmentFilters] = useMemo(
    () => [
      options.filter(isDimensionOption),
      options.filter(isSegmentOption),
      filters.filter(isSegment),
    ],
    [options, filters],
  );

  return (
    <ListRoot>
      {!!segments.length && (
        <SegmentListItem
          query={query}
          filters={segmentFilters}
          segments={segments}
          onAddFilter={onAddFilter}
          onRemoveFilter={onRemoveFilter}
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
            dimension={dimension}
            onAddFilter={onAddFilter}
            onChangeFilter={onChangeFilter}
            onRemoveFilter={onRemoveFilter}
          />
        ))}
        {!options.length && (
          <BulkFilterSelect
            query={query}
            dimension={dimension}
            onAddFilter={onAddFilter}
            onChangeFilter={onChangeFilter}
            onRemoveFilter={onRemoveFilter}
          />
        )}
      </ListRowContent>
    </ListRow>
  );
};

interface SegmentListItemProps {
  query: StructuredQuery;
  filters: Filter[];
  segments: SegmentOption[];
  onAddFilter: (filter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

const SegmentListItem = ({
  query,
  filters,
  segments,
  onAddFilter,
  onRemoveFilter,
}: SegmentListItemProps): JSX.Element => (
  <>
    <ListRow>
      <ListRowLabel>{t`Segments`}</ListRowLabel>
      <ListRowContent>
        <SegmentFilterSelect
          query={query}
          filters={filters}
          segments={segments}
          onAddFilter={onAddFilter}
          onRemoveFilter={onRemoveFilter}
        />
      </ListRowContent>
    </ListRow>
    <ModalDivider marginY="0.5rem" />
  </>
);

export default BulkFilterList;
