import React, { useCallback, useMemo } from "react";

import StructuredQuery, {
  SegmentOption,
} from "metabase-lib/lib/queries/StructuredQuery";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import Dimension from "metabase-lib/lib/Dimension";
import { isBoolean } from "metabase/lib/schema_metadata";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

import {
  SelectFilterButton,
  SelectFilterPopover,
  SegmentSelect,
} from "./BulkFilterSelect.styled";

export interface BulkFilterSelectProps {
  query: StructuredQuery;
  filter?: Filter;
  dimension: Dimension;
  handleChange: (newFilter: Filter) => void;
  handleClear: () => void;
}

export const BulkFilterSelect = ({
  query,
  filter,
  dimension,
  handleChange,
  handleClear,
}: BulkFilterSelectProps): JSX.Element => {
  const name = useMemo(() => {
    return filter?.displayName({ includeDimension: false });
  }, [filter]);

  const newFilter = useMemo(() => {
    return getNewFilter(query, dimension);
  }, [query, dimension]);

  return (
    <TippyPopoverWithTrigger
      sizeToFit
      renderTrigger={({ onClick }) => (
        <SelectFilterButton
          hasValue={filter != null}
          highlighted
          aria-label={dimension.displayName()}
          onClick={onClick}
          onClear={handleClear}
        >
          {name}
        </SelectFilterButton>
      )}
      popoverContent={({ closePopover }) => (
        <SelectFilterPopover
          query={query}
          filter={filter ?? newFilter}
          isNew={filter == null}
          showCustom={false}
          showFieldPicker={false}
          onChangeFilter={handleChange}
          onClose={closePopover}
          commitOnBlur
        />
      )}
    />
  );
};

const getNewFilter = (query: StructuredQuery, dimension: Dimension): Filter => {
  const filter = new Filter([], null, dimension.query() ?? query);

  const isBooleanField = isBoolean(dimension.field());

  return filter.setDimension(dimension.mbql(), {
    useDefaultOperator: !isBooleanField,
  });
};

export interface SegmentFilterSelectProps {
  query: StructuredQuery;
  segments: SegmentOption[];
  onAddFilter: (filter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
  onClearSegments: () => void;
}

export const SegmentFilterSelect = ({
  query,
  segments,
  onAddFilter,
  onRemoveFilter,
  onClearSegments,
}: SegmentFilterSelectProps): JSX.Element => {
  const activeSegmentOptions = useMemo(() => {
    const activeSegmentIds = query.segments().map(s => s.id);
    return segments.filter(segment =>
      activeSegmentIds.includes(segment.filter[1]),
    );
  }, [query, segments]);

  const toggleSegment = useCallback(
    (changedSegment: SegmentOption) => {
      const segmentIsActive = activeSegmentOptions.includes(changedSegment);

      const segmentFilter = segmentIsActive
        ? (query
            .filters()
            .find(
              f => f[0] === "segment" && f[1] === changedSegment.filter[1],
            ) as Filter)
        : new Filter(changedSegment.filter, null, query);

      segmentIsActive
        ? onRemoveFilter(segmentFilter)
        : onAddFilter(segmentFilter);
    },
    [query, activeSegmentOptions, onRemoveFilter, onAddFilter],
  );

  return (
    <SegmentSelect
      options={segments.map(segment => ({
        name: segment.name,
        value: segment,
        icon: segment.icon,
      }))}
      value={activeSegmentOptions}
      onChange={(e: any) => toggleSegment(e.target.value.changedItem)}
      multiple
      buttonProps={{
        hasValue: activeSegmentOptions.length > 0,
        highlighted: true,
        onClear: onClearSegments,
      }}
      buttonText={
        activeSegmentOptions.length > 1
          ? `${activeSegmentOptions.length} segments`
          : null
      }
    />
  );
};
