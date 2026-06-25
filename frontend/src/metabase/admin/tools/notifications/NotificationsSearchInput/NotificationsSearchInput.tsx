import { useEffect, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { Icon, Input, Loader, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

type Props = {
  value: string;
  isLoading?: boolean;
  onChange: (value: string) => void;
};

export const NotificationsSearchInput = ({
  value,
  isLoading = false,
  onChange,
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

  const showLoader = isLoading || query !== debounced;

  const handleClear = () => {
    setQuery("");
    lastPushedRef.current = "";
    onChangeRef.current("");
  };

  const renderRightSection = () => {
    if (showLoader) {
      return <Loader size="xs" />;
    }
    if (query === "") {
      return null;
    }
    return <Input.ClearButton c="text-secondary" onClick={handleClear} />;
  };

  return (
    <TextInput
      flex={1}
      placeholder={t`Search by question or owner…`}
      value={query}
      radius="md"
      onChange={(event) => setQuery(event.currentTarget.value)}
      leftSection={<Icon c="text-secondary" name="search" size={16} />}
      rightSectionPointerEvents="all"
      rightSection={renderRightSection()}
    />
  );
};
