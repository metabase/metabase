import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, memo, useState } from "react";
import { t } from "ttag";

import { FixedSizeIcon, Group, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

type RemappingsFilterBarProps = {
  query: string;
  onQueryChange: (query: string) => void;
};

export const RemappingsFilterBar = memo(function RemappingsFilterBar({
  query,
  onQueryChange,
}: RemappingsFilterBarProps) {
  const [searchValue, setSearchValue] = useState(query);

  const handleSearchDebounce = useDebouncedCallback((value: string) => {
    onQueryChange(value);
  }, SEARCH_DEBOUNCE_DURATION);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newSearchValue = event.target.value;
    setSearchValue(newSearchValue);
    handleSearchDebounce(newSearchValue);
  };

  return (
    <Group gap="md" align="center" wrap="nowrap">
      <TextInput
        value={searchValue}
        placeholder={t`Search…`}
        flex={1}
        leftSection={<FixedSizeIcon name="search" />}
        data-testid="remappings-search-input"
        onChange={handleSearchChange}
      />
    </Group>
  );
});
