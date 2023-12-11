import { useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import { SearchInput, SearchInputContainer } from "./FilterSearchInput.styled";

const SEARCH_TIMEOUT = 200;

interface FilterSearchInputProps {
  onChange: (value: string) => void;
}

export function FilterSearchInput({ onChange }: FilterSearchInputProps) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  useDebounce(() => onChange(value), SEARCH_TIMEOUT, [value]);

  return (
    <SearchInputContainer mx="md" justify="end">
      <SearchInput
        value={value}
        icon={<Icon name="search" />}
        variant={isFocused ? "default" : "unstyled"}
        placeholder={isFocused ? t`Search for a column…` : undefined}
        onChange={event => setValue(event.currentTarget.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onMouseEnter={event => event.currentTarget.focus()}
      />
    </SearchInputContainer>
  );
}
