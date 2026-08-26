import { useState } from "react";
import { t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { Select } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

import type { UserOption } from "./types";

type Props = {
  value: UserOption | null;
  onChange: (next: UserOption) => void;
  label?: string;
  placeholder?: string;
  flex?: number | string;
};

export const UserPicker = ({
  value,
  onChange,
  label,
  placeholder,
  flex,
}: Props) => {
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
    const option = options.find((o) => o.value === next);
    if (option) {
      onChange({ id: Number(option.value), label: option.label });
    }
  };

  return (
    <Select
      flex={flex}
      label={label}
      placeholder={placeholder ?? t`Select a user`}
      data={options}
      value={selectedOption?.value}
      onChange={handleChange}
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      filter={({ options }) => options}
      nothingFoundMessage={isFetching ? t`Searching…` : t`No users found`}
    />
  );
};
