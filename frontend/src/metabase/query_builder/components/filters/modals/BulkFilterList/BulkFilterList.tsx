import React, { useMemo } from "react";
import { t } from "ttag";

import StructuredQuery, {
  DimensionOption,
  SegmentOption,
  isDimensionOption,
  isSegmentOption,
} from "metabase-lib/lib/queries/StructuredQuery";
import Dimension from "metabase-lib/lib/Dimension";
import EmptyState from "metabase/components/EmptyState";

import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import { BulkFilterItem } from "../BulkFilterItem";
import { SegmentFilterSelect } from "../BulkFilterSelect";
import { InlineOperatorSelector } from "../InlineOperatorSelector";
import { ListRoot, ListRow, FilterContainer } from "./BulkFilterList.styled";
import { sortDimensions } from "./utils";

export interface BulkFilterListProps {
  query: StructuredQuery;
  filters: Filter[];
  isSearch?: boolean;
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
  isSearch,
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

  if (!dimensions.length && !segments.length) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          width: "100%",
        }}
      >
        <EmptyState
          message={<strong>{t`Didn't find anything`}</strong>}
          illustrationElement={
            <Icon name="search" size={40} color={color("text-light")} />
          }
        />
      </div>
    );
  }

  return (
    <ListRoot>
      {!!segments.length && (
        <SegmentListItem
          query={query}
          segments={segments}
          isSearch={isSearch}
          onAddFilter={onAddFilter}
          onRemoveFilter={onRemoveFilter}
          onClearSegments={onClearSegments}
        />
      )}
      {dimensions.map(({ dimension }, index) => (
        <BulkFilterListItem
          key={index}
          query={query}
          isSearch={isSearch}
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
  isSearch?: boolean;
  dimension: Dimension;
  onAddFilter: (filter: Filter) => void;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

const BulkFilterListItem = ({
  query,
  filters,
  isSearch,
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
    <ListRow>
      {options.map((filter, index) => (
        <FilterContainer
          key={index}
          data-testid={`filter-field-${dimension.displayName()}`}
        >
          <BulkFilterItem
            query={query}
            isSearch={isSearch}
            filter={filter}
            dimension={dimension}
            onAddFilter={onAddFilter}
            onChangeFilter={onChangeFilter}
            onRemoveFilter={onRemoveFilter}
          />
        </FilterContainer>
      ))}
    </ListRow>
  );
};

interface SegmentListItemProps {
  query: StructuredQuery;
  segments: SegmentOption[];
  isSearch?: boolean;
  onAddFilter: (filter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
  onClearSegments: () => void;
}

const SegmentListItem = ({
  query,
  segments,
  isSearch,
  onAddFilter,
  onRemoveFilter,
  onClearSegments,
}: SegmentListItemProps): JSX.Element => (
  <>
    <ListRow data-testid="filter-field-segments">
      <InlineOperatorSelector
        fieldName={t`Segments`}
        iconName="filter"
        tableName={isSearch ? query.table().displayName() : undefined}
        value="is"
      />
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
