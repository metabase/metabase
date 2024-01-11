import { useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";
import { Flex, TextInput, Icon } from "metabase/ui";

import { isSearchActive } from "../utils";

const SEARCH_TIMEOUT = 200;

interface FilterSearchInputProps {
  searchText: string;
  onChange: (searchText: string) => void;
}

export function FilterSearchInput({
  searchText,
  onChange,
}: FilterSearchInputProps) {
  const [inputText, setInputText] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const isActive = isFocused || isSearchActive(inputText);

  useDebounce(
    () => inputText !== searchText && onChange(inputText),
    SEARCH_TIMEOUT,
    [inputText],
  );

  return (
    <Flex mx="md" justify="end" style={{ flex: 1 }}>
      <TextInput
        type="search"
        value={inputText}
        icon={<Icon name="search" />}
        variant={isActive ? "default" : "unstyled"}
        placeholder={t`Search for a column…`}
        aria-hidden
        onChange={event => setInputText(event.currentTarget.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
    </Flex>
  );
}
