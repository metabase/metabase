import { skipToken } from "@reduxjs/toolkit/query/react";
import { useMemo } from "react";
import { t } from "ttag";

import { useGetFieldValuesQuery } from "metabase/api";
import { parseNumber } from "metabase/lib/number";
import { checkNotNull, isNotNull } from "metabase/lib/types";
import { Center, type ComboboxProps, Loader } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ListValuePicker } from "./ListValuePicker";
import { SearchValuePicker } from "./SearchValuePicker";
import { StaticValuePicker } from "./StaticValuePicker";
import {
  canListFieldValues,
  canLoadFieldValues,
  canSearchFieldValues,
  getNothingFoundMessage,
  getSearchPlaceholder,
  getStaticPlaceholder,
} from "./utils";

interface FilterValuePickerProps<T> {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: T[];
  autoFocus?: boolean;
  comboboxProps?: ComboboxProps;
  parseValue?: (rawValue: string) => string | null;
  onChange: (newValues: T[]) => void;
}

function FilterValuePicker({
  query,
  stageIndex,
  column,
  values: selectedValues,
  autoFocus = false,
  comboboxProps,
  parseValue,
  onChange,
}: FilterValuePickerProps<string>) {
  const fieldInfo = useMemo(
    () => Lib.fieldValuesSearchInfo(query, column),
    [query, column],
  );

  const { data: fieldData, isLoading } = useGetFieldValuesQuery(
    fieldInfo.fieldId ?? skipToken,
    { skip: !canLoadFieldValues(fieldInfo) },
  );

  if (isLoading) {
    return (
      <Center h="2.5rem">
        <Loader data-testid="loading-indicator" />
      </Center>
    );
  }

  if (fieldData && canListFieldValues(fieldData)) {
    return (
      <ListValuePicker
        fieldValues={fieldData.values}
        selectedValues={selectedValues}
        placeholder={t`Search the list`}
        autoFocus={autoFocus}
        onChange={onChange}
      />
    );
  }

  if (canSearchFieldValues(fieldInfo, fieldData)) {
    const searchColumn = checkNotNull(fieldInfo.searchField);
    const searchColumInfo = Lib.displayInfo(query, stageIndex, searchColumn);
    const searchColumName = searchColumInfo.displayName;

    return (
      <SearchValuePicker
        fieldId={checkNotNull(fieldInfo.fieldId)}
        searchFieldId={checkNotNull(fieldInfo.searchFieldId)}
        fieldValues={fieldData?.values ?? []}
        selectedValues={selectedValues}
        placeholder={getSearchPlaceholder(column, searchColumName)}
        nothingFoundMessage={getNothingFoundMessage(searchColumName)}
        autoFocus={autoFocus}
        comboboxProps={comboboxProps}
        parseValue={parseValue}
        onChange={onChange}
      />
    );
  }

  return (
    <StaticValuePicker
      selectedValues={selectedValues}
      placeholder={getStaticPlaceholder(column)}
      autoFocus={autoFocus}
      comboboxProps={comboboxProps}
      parseValue={parseValue}
      onChange={onChange}
    />
  );
}

export function StringFilterValuePicker(props: FilterValuePickerProps<string>) {
  return <FilterValuePicker {...props} />;
}

export function NumberFilterValuePicker({
  column,
  values,
  onChange,
  ...props
}: FilterValuePickerProps<Lib.NumberFilterValue>) {
  const parseValue = (rawValue: string) => {
    const number = parseNumber(rawValue);
    return number != null ? String(number) : null;
  };

  const handleChange = (newValues: string[]) => {
    onChange(newValues.map(parseNumber).filter(isNotNull));
  };

  return (
    <FilterValuePicker
      {...props}
      column={column}
      values={values.map((value) => String(value))}
      parseValue={parseValue}
      onChange={handleChange}
    />
  );
}
