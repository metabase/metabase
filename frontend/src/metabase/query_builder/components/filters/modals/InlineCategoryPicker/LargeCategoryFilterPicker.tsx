import React from "react";
import { t } from "ttag";

import type Filter from "metabase-lib/lib/queries/structured/Filter";
import type StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type Dimension from "metabase-lib/lib/Dimension";
import { pluralize } from "metabase/lib/formatting";

import Icon from "metabase/components/Icon";

import { BulkFilterSelect } from "../BulkFilterSelect";
import { TokenFieldContainer, AddText } from "./InlineCategoryPicker.styled";

import {
  TokenFieldItem,
  TokenFieldAddon,
} from "metabase/components/TokenFieldItem";

import { isValidOption } from "./utils";

interface LargeCategoryFilterPickerProps {
  query: StructuredQuery;
  filter: Filter;
  dimension: Dimension;
  onChange: (newFilter: Filter) => void;
  onClear: () => void;
}

export function LargeCategoryFilterPicker({
  query,
  filter,
  dimension,
  onChange,
  onClear,
}: LargeCategoryFilterPickerProps) {
  const filterValues = filter.arguments().filter(isValidOption);

  const removeValue = (value: string | number) =>
    onChange(
      filter.setArguments(
        filterValues.filter(filterValue => filterValue !== value),
      ),
    );

  const preventDefault = (e: React.SyntheticEvent) => e.preventDefault();

  return (
    <BulkFilterSelect
      query={query}
      filter={filter}
      dimension={dimension}
      handleChange={onChange}
      handleClear={onClear}
      customTrigger={({ onClick }) => (
        <TokenFieldContainer
          data-testid="large-category-picker"
          onClick={onClick}
        >
          {filterValues.map(filterValue => (
            <TokenFieldItem key={filterValue} isValid onClick={preventDefault}>
              <span>{filterValue}</span>
              <TokenFieldAddon
                isValid
                onClick={e => {
                  e.stopPropagation();
                  removeValue(filterValue);
                }}
              >
                <Icon name="close" className="flex align-center" size={12} />
              </TokenFieldAddon>
            </TokenFieldItem>
          ))}
          <AddText>
            {t`Select ${pluralize(dimension.displayName().toLowerCase())}...`}
          </AddText>
        </TokenFieldContainer>
      )}
    />
  );
}
