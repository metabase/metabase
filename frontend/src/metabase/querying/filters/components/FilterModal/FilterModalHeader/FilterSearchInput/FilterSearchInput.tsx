import { useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import { TextInput } from "metabase/ui";

import { SearchIcon } from "./FilterSearchInput.styled";

const SEARCH_TIMEOUT = 200;

interface FilterSearchInputProps {
  className?: string;
  searchText: string;
  onChange: (searchText: string) => void;
}

export function FilterSearchInput({
  className,
  searchText,
  onChange,
}: FilterSearchInputProps) {
  const [inputText, setInputText] = useState("");

  useDebounce(
    () => inputText !== searchText && onChange(inputText),
    SEARCH_TIMEOUT,
    [inputText],
  );

  return (
    <TextInput
      autoFocus
      className={className}
      type="search"
      value={inputText}
      icon={<SearchIcon name="search" />}
      placeholder={t`Search for a column…`}
      onChange={event => setInputText(event.currentTarget.value)}
    />
  );
}
