import { useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import { Icon, TextInput } from "metabase/ui";

const SEARCH_TIMEOUT = 200;

interface FilterSearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function FilterSearchInput({ value, onChange }: FilterSearchInputProps) {
  const [inputText, setInputText] = useState("");

  useDebounce(
    () => inputText !== value && onChange(inputText),
    SEARCH_TIMEOUT,
    [inputText],
  );

  return (
    <TextInput
      type="search"
      value={inputText}
      leftSection={<Icon name="search" />}
      placeholder={t`Search for a column…`}
      onChange={event => setInputText(event.currentTarget.value)}
    />
  );
}
