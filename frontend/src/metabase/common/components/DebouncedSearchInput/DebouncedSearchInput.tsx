import { useEffect, useRef, useState } from "react";
import { useLatest } from "react-use";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { Icon, Input, TextInput, type TextInputProps } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

type Props = {
  value: string;
  onChange: (value: string) => void;
} & Omit<TextInputProps, "value" | "onChange">;

export const DebouncedSearchInput = ({
  value,
  onChange,
  ...textInputProps
}: Props) => {
  const [query, setQuery] = useState(value);
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_DURATION);
  const onChangeRef = useLatest(onChange);
  const lastPushedRef = useRef(value);

  useEffect(() => {
    if (debounced !== lastPushedRef.current) {
      lastPushedRef.current = debounced;
      onChangeRef.current(debounced);
    }
  }, [debounced, onChangeRef]);

  useEffect(() => {
    if (value !== lastPushedRef.current) {
      lastPushedRef.current = value;
      setQuery(value);
    }
  }, [value]);

  const handleClear = () => {
    setQuery("");
    lastPushedRef.current = "";
    onChangeRef.current("");
  };

  const renderRightSection = () => {
    if (query === "") {
      return null;
    }
    return <Input.ClearButton c="text-secondary" onClick={handleClear} />;
  };

  return (
    <TextInput
      flex={1}
      value={query}
      radius="md"
      onChange={(event) => setQuery(event.currentTarget.value)}
      leftSection={<Icon c="text-secondary" name="search" size={16} />}
      rightSectionPointerEvents="all"
      rightSection={renderRightSection()}
      {...textInputProps}
    />
  );
};
