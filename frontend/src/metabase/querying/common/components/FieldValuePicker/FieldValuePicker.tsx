import { t } from "ttag";

import {
  ListSkeleton,
  LoadingSkeleton,
} from "metabase/common/components/Skeletons";
import { type ComboboxProps, Skeleton } from "metabase/ui";

import { ListValuePicker } from "./ListValuePicker";
import { SearchValuePicker } from "./SearchValuePicker";
import { StaticValuePicker } from "./StaticValuePicker";
import type {
  UseGetFieldValuesArgs,
  UseGetFieldValuesResult,
  UseGetRemappedFieldValueArgs,
  UseGetRemappedFieldValueResult,
  UseSearchFieldValuesArgs,
  UseSearchFieldValuesResult,
} from "./types";
import { canShowListPicker, canShowSearchPicker } from "./utils";

const SKELETON_CHECKBOX_COUNT = 5;

export interface FieldValuePickerProps {
  values: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  nothingFoundMessage?: string;
  autoFocus?: boolean;
  canListValues?: boolean;
  canSearchValues?: boolean;
  canRemapValues?: boolean;
  comboboxProps?: ComboboxProps;
  parseValue?: (rawValue: string) => string | null;
  useGetFieldValues: (args: UseGetFieldValuesArgs) => UseGetFieldValuesResult;
  useSearchFieldValues: (
    args: UseSearchFieldValuesArgs,
  ) => UseSearchFieldValuesResult;
  useGetRemappedFieldValue: (
    args: UseGetRemappedFieldValueArgs,
  ) => UseGetRemappedFieldValueResult;
  onChange: (newValues: string[]) => void;
}

export function FieldValuePicker({
  values: selectedValues,
  placeholder,
  searchPlaceholder,
  nothingFoundMessage,
  autoFocus = false,
  canListValues = false,
  canSearchValues = false,
  canRemapValues = false,
  comboboxProps,
  parseValue,
  useGetFieldValues,
  useSearchFieldValues,
  useGetRemappedFieldValue,
  onChange,
}: FieldValuePickerProps) {
  const { data: fieldData, isLoading } = useGetFieldValues({
    skip: !canListValues,
  });

  if (isLoading) {
    return <ListValuePickerSkeleton />;
  }

  if (fieldData && canShowListPicker(fieldData)) {
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

  if (canShowSearchPicker(canListValues, canSearchValues, fieldData)) {
    return (
      <SearchValuePicker
        canRemapValues={canRemapValues}
        fieldValues={fieldData?.values ?? []}
        selectedValues={selectedValues}
        placeholder={searchPlaceholder}
        nothingFoundMessage={nothingFoundMessage}
        autoFocus={autoFocus}
        comboboxProps={comboboxProps}
        parseValue={parseValue}
        useSearchFieldValues={useSearchFieldValues}
        useGetRemappedFieldValue={useGetRemappedFieldValue}
        onChange={onChange}
      />
    );
  }

  return (
    <StaticValuePicker
      selectedValues={selectedValues}
      placeholder={placeholder}
      autoFocus={autoFocus}
      comboboxProps={comboboxProps}
      parseValue={parseValue}
      onChange={onChange}
    />
  );
}

function ListValuePickerSkeleton() {
  return (
    <LoadingSkeleton>
      <Skeleton h={40} radius="sm" />
      <ListSkeleton rows={SKELETON_CHECKBOX_COUNT} iconSize={20} gap="md" />
    </LoadingSkeleton>
  );
}
