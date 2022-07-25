import React from "react";
import { t } from "ttag";

import type Filter from "metabase-lib/lib/queries/structured/Filter";
import type StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type Dimension from "metabase-lib/lib/Dimension";

import Icon from "metabase/components/Icon";

import { BulkFilterSelect } from "../BulkFilterSelect";
import {
  TokenFieldContainer,
  AddButton,
  AddButtonIcon,
  AddButtonLabel,
} from "./InlineCategoryPicker.styled";

import {
  TokenFieldItem,
  TokenFieldAddon,
} from "metabase/components/TokenField/TokenField.styled";

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

  return (
    <TokenFieldContainer>
      {filterValues.map(filterValue => (
        <TokenFieldItem key={filterValue} isValid>
          <span className="pl1">{filterValue}</span>
          <TokenFieldAddon isValid onClick={() => removeValue(filterValue)}>
            <Icon name="close" className="flex align-center" size={12} />
          </TokenFieldAddon>
        </TokenFieldItem>
      ))}
      <BulkFilterSelect
        query={query}
        filter={filter}
        dimension={dimension}
        handleChange={onChange}
        handleClear={onClear}
        customTrigger={({ onClick }) => (
          <AddButton onClick={onClick} aria-label={t`Add options`}>
            <AddButtonIcon name="add" size={14} />
            {filterValues?.length === 0 && (
              <AddButtonLabel>{t`Add options`}</AddButtonLabel>
            )}
          </AddButton>
        )}
      />
    </TokenFieldContainer>
  );
}
