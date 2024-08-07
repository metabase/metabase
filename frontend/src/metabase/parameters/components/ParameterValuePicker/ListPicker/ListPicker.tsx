import { useCallback, useRef } from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";
import { useDebouncedCallback } from "use-debounce";

import { Select, Loader, type SelectOption } from "metabase/ui";

import { PickerIcon } from "../ParameterValuePicker.styled";
import { blurOnCommitKey } from "../utils";

import S from "./ListPicker.css";

interface ListPickerProps {
  value: string;
  options: (string | SelectOption)[];
  onChange: (value: string) => void;
  onClear: () => void;
  onSearchChange?: (query: string) => void;
  /** Omit the prop or pass -1 if you want to disable it */
  searchDebounceMs?: number;
  onDropdownOpen?: () => void;
  onDropdownClose?: () => void;
  enableSearch: boolean;
  isLoading: boolean;
  noResultsText: string;
  placeholder: string;
  errorMessage?: string;
}

// TODO show "remove" button when typing, static list parameters (metabase#40226)
export function ListPicker(props: ListPickerProps) {
  const {
    value,
    options,
    onChange,
    onClear,
    onSearchChange = noop,
    searchDebounceMs = -1,
    onDropdownOpen,
    onDropdownClose,
    enableSearch,
    placeholder,
    noResultsText,
    isLoading,
    errorMessage,
  } = props;

  const icon = isLoading ? (
    <div data-testid="listpicker-loader">
      <Loader size="xs" />
    </div>
  ) : value ? (
    <PickerIcon aria-label={t`Clear`} name="close" onClick={onClear} />
  ) : null;

  const debouncedOnSearch = useDebouncedCallback(
    useCallback(onSearchChange, [onSearchChange]),
    searchDebounceMs,
  );

  // For some reason Select is firing multiple events, which isn't needed.
  const lastSearch = useRef<string>();
  const singleOnSearch = useCallback(
    (search: string) => {
      if (search !== lastSearch.current) {
        lastSearch.current = search;
        if (searchDebounceMs === -1) {
          onSearchChange(search);
        } else {
          debouncedOnSearch(search);
        }
      }
    },
    [onSearchChange, debouncedOnSearch, searchDebounceMs],
  );
  useUnmount(() => {
    if (lastSearch.current) {
      onSearchChange(lastSearch.current);
    }
    debouncedOnSearch.cancel();
  });

  return (
    <Select
      // This is required until we fix the Select to support maxDropdownHeight
      classNames={{ dropdown: S.dropdown }}
      error={errorMessage}
      value={value}
      data={options}
      onChange={onChange}
      rightSection={icon}
      placeholder={placeholder}
      searchable={enableSearch}
      onKeyUp={blurOnCommitKey}
      nothingFound={noResultsText}
      onSearchChange={singleOnSearch}
      onDropdownOpen={onDropdownOpen}
      onDropdownClose={onDropdownClose}
      inputWrapperOrder={["label", "input", "error", "description"]}
    />
  );
}

function noop() {}
