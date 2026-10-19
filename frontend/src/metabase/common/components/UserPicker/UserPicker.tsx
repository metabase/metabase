import { useState } from "react";
import { t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { Select, type SelectProps } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

import type { UserOption } from "./types";

type BaseProps = {
  value: UserOption | null;
  label?: string;
  "aria-label"?: string;
  placeholder?: string;
  flex?: number | string;
  comboboxProps?: SelectProps["comboboxProps"];
};

type Props = BaseProps &
  (
    | { clearable: true; onChange: (next: UserOption | null) => void }
    | { clearable?: false; onChange: (next: UserOption) => void }
  );

export const UserPicker = (props: Props) => {
  const {
    value,
    label,
    "aria-label": ariaLabel,
    placeholder,
    flex,
    clearable,
    comboboxProps,
  } = props;
  // Mantine reports null even when not clearable, so drop it for callers that can't take one
  const notify: (next: UserOption | null) => void = props.clearable
    ? props.onChange
    : (next) => {
        if (next !== null) {
          props.onChange(next);
        }
      };

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);
  const trimmedSearch = debouncedSearch.trim();

  // Mantine writes the selected label back into the search input; map that
  // case to an empty query so we show the full list instead of re-searching
  // the BE for the literal selected name (which returns empty for names with
  // spaces).
  const query = value && trimmedSearch === value.label ? "" : trimmedSearch;

  const { data, isFetching } = useListUsersQuery({
    query,
    limit: 50,
    status: "all",
  });

  const fetchedOptions = (data?.data ?? []).map((user) => ({
    value: String(user.id),
    label: user.common_name,
  }));

  const selectedOption = value && {
    value: String(value.id),
    label: value.label,
  };

  const options =
    selectedOption &&
    !fetchedOptions.some((o) => o.value === selectedOption.value)
      ? [selectedOption, ...fetchedOptions]
      : fetchedOptions;

  const handleChange = (next: string | null) => {
    if (next === null) {
      notify(null);
      return;
    }
    const option = options.find((o) => o.value === next);
    if (option) {
      notify({ id: Number(option.value), label: option.label });
    }
  };

  return (
    <Select
      flex={flex}
      label={label}
      aria-label={ariaLabel}
      placeholder={placeholder ?? t`Select a user`}
      data={options}
      value={selectedOption?.value ?? null}
      onChange={handleChange}
      clearable={clearable}
      comboboxProps={comboboxProps}
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      filter={({ options }) => options}
      nothingFoundMessage={isFetching ? t`Searching…` : t`No users found`}
    />
  );
};
