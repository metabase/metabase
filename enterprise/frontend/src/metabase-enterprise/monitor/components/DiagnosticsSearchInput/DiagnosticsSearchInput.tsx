import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, memo, useState } from "react";
import { t } from "ttag";

import { FixedSizeIcon, Loader, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

type DiagnosticsSearchInputProps = {
  query?: string;
  placeholder?: string;
  isFetching: boolean;
  isLoading: boolean;
  "data-testid"?: string;
  onChange: (query: string | undefined) => void;
};

export const DiagnosticsSearchInput = memo(function DiagnosticsSearchInput({
  query,
  placeholder = t`Search…`,
  isFetching,
  isLoading,
  "data-testid": dataTestId,
  onChange,
}: DiagnosticsSearchInputProps) {
  const [searchValue, setSearchValue] = useState(query ?? "");
  const hasLoader = isFetching && !isLoading;

  const handleChangeDebounced = useDebouncedCallback(
    (newSearchValue: string) => {
      const trimmed = newSearchValue.trim();
      onChange(trimmed.length > 0 ? trimmed : undefined);
    },
    SEARCH_DEBOUNCE_DURATION,
  );

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newSearchValue = event.target.value;
    setSearchValue(newSearchValue);
    handleChangeDebounced(newSearchValue);
  };

  return (
    <TextInput
      value={searchValue}
      placeholder={placeholder}
      flex={1}
      leftSection={<FixedSizeIcon name="search" />}
      rightSection={hasLoader ? <Loader size="sm" /> : undefined}
      data-testid={dataTestId}
      onChange={handleChange}
    />
  );
});
