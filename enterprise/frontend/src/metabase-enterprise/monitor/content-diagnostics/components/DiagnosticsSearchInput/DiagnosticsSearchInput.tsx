import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, useState } from "react";
import { t } from "ttag";

import { FixedSizeIcon, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

type DiagnosticsSearchInputProps = {
  query?: string;
  onQueryChange: (query: string | undefined) => void;
};

export function DiagnosticsSearchInput({
  query,
  onQueryChange,
}: DiagnosticsSearchInputProps) {
  const [searchValue, setSearchValue] = useState(query ?? "");

  const handleSearchDebounce = useDebouncedCallback(
    (newSearchValue: string) => {
      const trimmed = newSearchValue.trim();
      onQueryChange(trimmed.length > 0 ? trimmed : undefined);
    },
    SEARCH_DEBOUNCE_DURATION,
  );

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newSearchValue = event.target.value;
    setSearchValue(newSearchValue);
    handleSearchDebounce(newSearchValue);
  };

  return (
    <TextInput
      value={searchValue}
      placeholder={t`Search…`}
      aria-label={t`Search`}
      flex={1}
      leftSection={<FixedSizeIcon name="search" />}
      onChange={handleSearchChange}
    />
  );
}
