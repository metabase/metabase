import React, { useMemo, useCallback } from "react";
import _ from "underscore";
import { t } from "ttag";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import { Filter as FilterExpression } from "metabase-types/types/Query";

import Icon from "metabase/components/Icon";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Dimension from "metabase-lib/lib/Dimension";

import { OPTIONS } from "metabase/query_builder/components/filters/pickers/DatePicker/DatePickerShortcuts";

import { BulkFilterSelect } from "../BulkFilterSelect";

import {
  OptionButton,
  OptionContainer,
  ClearButton,
} from "./InlineDatePicker.styled";

const DATE_SHORTCUT_OPTIONS = [
  OPTIONS.DAY_OPTIONS[0], // Today
  OPTIONS.DAY_OPTIONS[1], // Yesterday
  OPTIONS.DAY_OPTIONS[2], // Last Week
  OPTIONS.MONTH_OPTIONS[0], // Last Month
];

interface InlineDatePickerProps {
  query: StructuredQuery;
  filter?: Filter;
  newFilter: Filter;
  dimension: Dimension;
  onChange: (newFilter: Filter) => void;
  onClear: () => void;
}

export function InlineDatePicker({
  query,
  filter,
  newFilter,
  dimension,
  onChange,
  onClear,
}: InlineDatePickerProps) {
  const selectedFilterIndex = useMemo(() => {
    if (!filter) {
      return null;
    }
    const optionIndex = DATE_SHORTCUT_OPTIONS.findIndex(({ init }) =>
      _.isEqual(filter, init(filter)),
    );
    return optionIndex !== -1 ? optionIndex : null;
  }, [filter]);

  const handleShortcutChange = (init: (filter: Filter) => FilterExpression) => {
    onChange(new Filter(init(filter ?? newFilter), null, query));
  };

  const handleClear = useCallback(
    e => {
      e.stopPropagation();
      onClear();
    },
    [onClear],
  );

  const shouldShowShortcutOptions = !filter || selectedFilterIndex !== null;

  return (
    <OptionContainer
      data-testid="date-picker"
      aria-label={dimension?.field()?.displayName()}
    >
      {shouldShowShortcutOptions &&
        DATE_SHORTCUT_OPTIONS.map(({ displayName, init }, index) => (
          <OptionButton
            key={displayName}
            active={index === selectedFilterIndex}
            onClick={
              index === selectedFilterIndex
                ? onClear
                : () => handleShortcutChange(init)
            }
          >
            <span aria-selected={index === selectedFilterIndex}>
              {displayName}
            </span>
          </OptionButton>
        ))}

      <BulkFilterSelect
        query={query}
        filter={filter}
        dimension={dimension}
        handleChange={onChange}
        handleClear={onClear}
        customTrigger={({ onClick }) =>
          filter && selectedFilterIndex === null ? (
            <OptionButton active onClick={onClick}>
              <span>{filter.displayName({ includeDimension: false })}</span>
              <ClearButton onClick={handleClear}>
                <Icon name="close" size={12} />
              </ClearButton>
            </OptionButton>
          ) : (
            <OptionButton onClick={onClick} aria-label={t`more options`}>
              <Icon name="ellipsis" size={14} style={{ marginBottom: -5 }} />
            </OptionButton>
          )
        }
      />
    </OptionContainer>
  );
}
