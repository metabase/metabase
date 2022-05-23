import React, { useCallback, useMemo } from "react";
import { xor } from "lodash";

import StructuredQuery, {
  SegmentOption,
} from "metabase-lib/lib/queries/StructuredQuery";
import Select from "metabase/core/components/Select";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import Dimension from "metabase-lib/lib/Dimension";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import {
  SelectFilterButton,
  SelectFilterPopover,
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
  filters?: Filter[];
  segments: SegmentOption[];
  onAddFilter: (filter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

export const SegmentFilterSelect = ({
  query,
  filters,
  segments,
  onAddFilter,
  onRemoveFilter,
}: SegmentFilterSelectProps): JSX.Element => {
  const activeSegments = useMemo(() => {
    return segments.filter(segment => {
      return !!filters?.find(
        filter => filter[0] === "segment" && filter[1] === segment.filter[1],
      );
    });
  }, [filters, segments]);

  const toggleSegment = useCallback(
    (newActiveSegments: SegmentOption[]) => {
      const [changedSegment] = xor(newActiveSegments, activeSegments);
      const segmentIsActive = activeSegments.includes(changedSegment);

      const segmentFilter = new Filter(changedSegment.filter, null, query);

      segmentIsActive
        ? onRemoveFilter(segmentFilter)
        : onAddFilter(segmentFilter);
    },
    [query, activeSegments, onRemoveFilter, onAddFilter],
  );

  return (
    <div>
      <Select
        options={segments.map(segment => ({
          name: segment.name,
          value: segment,
          icon: segment.icon,
        }))}
        value={activeSegments}
        multiple={true}
        optionNameFn={(o: any) => o?.name}
        optionValueFn={(o: any) => o?.value ?? o}
        onChange={(e: any) => toggleSegment(e.target.value)}
      />
    </div>
  );
};
