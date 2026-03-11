import { skipToken } from "@reduxjs/toolkit/query/react";
import { useMemo } from "react";

import {
  useGetFieldValuesQuery,
  useGetRemappedFieldValueQuery,
  useSearchFieldValuesQuery,
} from "metabase/api";
import { parseNumber } from "metabase/lib/number";
import {
  FieldValuePicker,
  type UseGetFieldValuesArgs,
  type UseGetRemappedFieldValueArgs,
  type UseSearchFieldValuesArgs,
} from "metabase/querying/common/components/FieldValuePicker";
import type { ComboboxProps } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  canListFieldValues,
  canRemapFieldValues,
  canSearchFieldValues,
  getNothingFoundMessage,
  getSearchPlaceholder,
  getStaticPlaceholder,
} from "./utils";

type FilterValuePickerProps<T> = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: T[];
  autoFocus?: boolean;
  comboboxProps?: ComboboxProps;
  onChange: (newValues: T[]) => void;
};

type FilterValuePickerOwnProps = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: string[];
  autoFocus?: boolean;
  comboboxProps?: ComboboxProps;
  parseValue?: (rawValue: string) => string | null;
  onChange: (newValues: string[]) => void;
};

function FilterValuePicker({
  query,
  stageIndex,
  column,
  values,
  autoFocus,
  comboboxProps,
  parseValue,
  onChange,
}: FilterValuePickerOwnProps) {
  const fieldInfo = useMemo(
    () => Lib.fieldValuesSearchInfo(query, column),
    [query, column],
  );

  const searchColumnName = useMemo(() => {
    return fieldInfo.searchField
      ? Lib.displayInfo(query, stageIndex, fieldInfo.searchField).displayName
      : undefined;
  }, [query, stageIndex, fieldInfo.searchField]);

  const canListValues = canListFieldValues(fieldInfo);
  const canSearchValues = canSearchFieldValues(fieldInfo);
  const canRemapValues = canRemapFieldValues(fieldInfo);

  const useGetFieldValues = ({ skip }: UseGetFieldValuesArgs) => {
    return useGetFieldValuesQuery(
      fieldInfo.fieldId == null || skip ? skipToken : fieldInfo.fieldId,
    );
  };

  const useSearchFieldValues = ({
    value,
    limit,
    skip,
  }: UseSearchFieldValuesArgs) => {
    return useSearchFieldValuesQuery(
      fieldInfo.fieldId == null || fieldInfo.searchFieldId == null || skip
        ? skipToken
        : {
            fieldId: fieldInfo.fieldId,
            searchFieldId: fieldInfo.searchFieldId,
            value,
            limit,
          },
    );
  };

  const useGetRemappedFieldValue = ({
    value,
    skip,
  }: UseGetRemappedFieldValueArgs) => {
    return useGetRemappedFieldValueQuery(
      fieldInfo.fieldId == null || fieldInfo.searchFieldId == null || skip
        ? skipToken
        : {
            fieldId: fieldInfo.fieldId,
            remappedFieldId: fieldInfo.searchFieldId,
            value,
          },
    );
  };

  return (
    <FieldValuePicker
      values={values}
      placeholder={getStaticPlaceholder(column)}
      searchPlaceholder={
        searchColumnName
          ? getSearchPlaceholder(column, searchColumnName)
          : undefined
      }
      nothingFoundMessage={
        searchColumnName ? getNothingFoundMessage(searchColumnName) : undefined
      }
      autoFocus={autoFocus}
      canListValues={canListValues}
      canSearchValues={canSearchValues}
      canRemapValues={canRemapValues}
      comboboxProps={comboboxProps}
      parseValue={parseValue}
      useGetFieldValues={useGetFieldValues}
      useSearchFieldValues={useSearchFieldValues}
      useGetRemappedFieldValue={useGetRemappedFieldValue}
      onChange={onChange}
    />
  );
}

type StringFilterValuePickerProps = FilterValuePickerProps<string>;

export function StringFilterValuePicker(props: StringFilterValuePickerProps) {
  return <FilterValuePicker {...props} />;
}

type NumberFilterValuePickerProps =
  FilterValuePickerProps<Lib.NumberFilterValue>;

export function NumberFilterValuePicker({
  values,
  onChange,
  ...props
}: NumberFilterValuePickerProps) {
  const parseValue = (rawValue: string) => {
    const number = parseNumber(rawValue);
    return number != null ? String(number) : null;
  };

  const handleChange = (newValues: string[]) => {
    onChange(newValues.map(parseNumber).filter((value) => value != null));
  };

  return (
    <FilterValuePicker
      {...props}
      values={values.map(String)}
      parseValue={parseValue}
      onChange={handleChange}
    />
  );
}
