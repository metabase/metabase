import { useState } from "react";
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import { SearchInput, SearchInputContainer } from "./FilterSearchInput.styled";

export function FilterSearchInput() {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <SearchInputContainer mx="md" justify="end">
      <SearchInput
        icon={<Icon name="search" />}
        variant={isFocused ? "default" : "unstyled"}
        placeholder={isFocused ? t`Search for a column…` : undefined}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onMouseEnter={event => event.currentTarget.focus()}
      />
    </SearchInputContainer>
  );
}
