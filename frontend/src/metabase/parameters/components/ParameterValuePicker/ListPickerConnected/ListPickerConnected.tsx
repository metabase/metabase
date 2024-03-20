import { useState } from "react";
import { useAsync, useDebounce } from "react-use";
import { t } from "ttag";

import type { Parameter, ParameterValues } from "metabase-types/api";

import { ListPicker } from "../ListPicker";

interface ListPickerConnectedProps {
  value: string | null;
  parameter: Parameter;
  fetchValues: (query: string) => Promise<ParameterValues>;
  onChange: (value: string | null) => void;
}

export function ListPickerConnected({
  value,
  parameter,
  fetchValues,
  onChange,
}: ListPickerConnectedProps) {
  const [isOpened, setIsOpened] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const {
    value: fetchedValues,
    loading: isLoading,
    error,
  } = useAsync(
    async () => (isOpened ? fetchValues(searchQuery) : undefined),
    [
      isOpened,
      searchQuery,
      parameter.values_source_type,
      parameter.values_source_config,
      fetchValues,
    ],
  );

  const items = getDropdownItems(value, fetchedValues);

  const handleSearchChange = () => {
    if (parameter.values_query_type === "search") {
      setSearchQuery(searchValue);
    }
  };

  useDebounce(handleSearchChange, 100, [searchValue]);

  return (
    <ListPicker
      data={items}
      value={value}
      searchValue={searchValue}
      placeholder={t`Select a default value…`}
      notFoundMessage={getNotFoundMessage(items, isLoading, error)}
      errorMessage={getErrorMessage(error)}
      isLoading={isLoading}
      onChange={onChange}
      onSearchChange={setSearchValue}
      onDropdownOpen={() => setIsOpened(true)}
      onDropdownClose={() => setIsOpened(false)}
    />
  );
}

function getDropdownItems(
  selectedValue: string | null,
  fetchedValues: ParameterValues | undefined,
) {
  const items = [
    ...(fetchedValues?.values.map(([value]) => String(value)) ?? []),
    ...(selectedValue ? [selectedValue] : []),
  ];
  return [...new Set(items)];
}

function getNotFoundMessage(
  items: string[],
  isLoading: boolean,
  error: unknown,
) {
  if (isLoading) {
    return t`Loading…`;
  } else if (error) {
    return null;
  } else {
    return t`No matching result`;
  }
}

function getErrorMessage(error: unknown) {
  return error ? t`Loading values failed. Please try again shortly.` : null;
}
