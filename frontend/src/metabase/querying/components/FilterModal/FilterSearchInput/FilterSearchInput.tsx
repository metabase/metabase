import { useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import { isSearchActive } from "../utils";
import { SearchInput, SearchInputContainer } from "./FilterSearchInput.styled";

const SEARCH_TIMEOUT = 200;

interface FilterSearchInputProps {
  onChange: (value: string) => void;
}

export function FilterSearchInput({ onChange }: FilterSearchInputProps) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const isActive = isFocused || isSearchActive(value);

  useDebounce(() => onChange(value), SEARCH_TIMEOUT, [value]);

  return (
    <SearchInputContainer mx="md" justify="end">
      <SearchInput
        type="search"
        value={value}
        icon={<Icon name="search" />}
        variant={isActive ? "default" : "unstyled"}
        placeholder={isActive ? t`Search for a column…` : undefined}
        isActive={isActive}
        onChange={event => setValue(event.currentTarget.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onMouseEnter={event => event.currentTarget.focus()}
      />
    </SearchInputContainer>
  );
}
