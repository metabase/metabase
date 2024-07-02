import { useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import { TextInput, Icon } from "metabase/ui";

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

  useDebounce(
    () => inputText !== searchText && onChange(inputText),
    SEARCH_TIMEOUT,
    [inputText],
  );

  return (
    <TextInput
      type="search"
      value={inputText}
      icon={<Icon name="search" />}
      placeholder={t`Search for a column…`}
      aria-hidden
      onChange={event => setInputText(event.currentTarget.value)}
    />
  );
}
