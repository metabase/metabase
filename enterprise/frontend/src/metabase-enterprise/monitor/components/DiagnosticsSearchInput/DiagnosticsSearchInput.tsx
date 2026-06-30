import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, memo, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { FixedSizeIcon, Loader, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

type DiagnosticsSearchInputProps = {
  query?: string;
  placeholder?: string;
  "aria-label"?: string;
  isFetching: boolean;
  isLoading: boolean;
  "data-testid"?: string;
  onChange: (query: string | undefined) => void;
};

export const DiagnosticsSearchInput = memo(function DiagnosticsSearchInput({
  query,
  placeholder = t`Search…`,
  "aria-label": ariaLabel = t`Search`,
  isFetching,
  isLoading,
  "data-testid": dataTestId,
  onChange,
}: DiagnosticsSearchInputProps) {
  const [searchValue, setSearchValue] = useState(query ?? "");
  // Track the value we last pushed up so a debounced self-update doesn't fight
  // the sync effect, while an external `query` change (back/forward nav,
  // restored params) still re-syncs the visible field.
  const lastPushedRef = useRef(query ?? "");
  const hasLoader = isFetching && !isLoading;

  const handleChangeDebounced = useDebouncedCallback(
    (newSearchValue: string) => {
      const trimmed = newSearchValue.trim();
      lastPushedRef.current = trimmed;
      onChange(trimmed.length > 0 ? trimmed : undefined);
    },
    SEARCH_DEBOUNCE_DURATION,
  );

  useEffect(() => {
    const controlledValue = query ?? "";
    if (controlledValue !== lastPushedRef.current) {
      lastPushedRef.current = controlledValue;
      setSearchValue(controlledValue);
    }
  }, [query]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newSearchValue = event.target.value;
    setSearchValue(newSearchValue);
    handleChangeDebounced(newSearchValue);
  };

  return (
    <TextInput
      value={searchValue}
      placeholder={placeholder}
      aria-label={ariaLabel}
      flex={1}
      leftSection={<FixedSizeIcon name="search" />}
      rightSection={hasLoader ? <Loader size="sm" /> : undefined}
      data-testid={dataTestId}
      onChange={handleChange}
    />
  );
});
