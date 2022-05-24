import React, { useCallback, useMemo } from "react";
import { xor } from "lodash";

import StructuredQuery, {
  SegmentOption,
} from "metabase-lib/lib/queries/StructuredQuery";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import Dimension from "metabase-lib/lib/Dimension";
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
  onAddFilter: (filter: Filter) => void;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

export const BulkFilterSelect = ({
  query,
  filter,
  dimension,
  onAddFilter,
  onChangeFilter,
  onRemoveFilter,
}: BulkFilterSelectProps): JSX.Element => {
  const name = useMemo(() => {
    return filter?.displayName({ includeDimension: false });
  }, [filter]);

  const newFilter = useMemo(() => {
    return getNewFilter(query, dimension);
  }, [query, dimension]);

  const handleChange = useCallback(
    (newFilter: Filter) => {
      if (filter) {
        onChangeFilter(filter, newFilter);
      } else {
        onAddFilter(newFilter);
      }
    },
    [filter, onAddFilter, onChangeFilter],
  );

  const handleClear = useCallback(() => {
    if (filter) {
      onRemoveFilter(filter);
    }
  }, [filter, onRemoveFilter]);

  return (
    <TippyPopoverWithTrigger
      sizeToFit
      renderTrigger={({ onClick }) => (
        <SelectFilterButton
          hasValue={filter != null}
          highlighted
          aria-label={dimension.displayName()}
          onClick={onClick}
          onClear={filter ? handleClear : undefined}
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
        />
      )}
    />
  );
};

const getNewFilter = (query: StructuredQuery, dimension: Dimension): Filter => {
  const filter = new Filter([], null, dimension.query() ?? query);
  return filter.setDimension(dimension.mbql(), { useDefaultOperator: true });
};

export interface SegmentFilterSelectProps {
  query: StructuredQuery;
  segments: SegmentOption[];
  onAddFilter: (filter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

export const SegmentFilterSelect = ({
  query,
  segments,
  onAddFilter,
  onRemoveFilter,
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
      const segmentFilter = new Filter(changedSegment.filter, null, query);

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
    />
  );
};
