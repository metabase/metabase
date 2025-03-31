import { useCallback, useState } from "react";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { Box, Flex, Icon, TextInput } from "metabase/ui";

import { SearchResultsList } from "./SearchResultsList";

export const DataImporter = () => {
  const [search, setSearch] = useState("");
  const [activeTab] = useState<string | null>("explore");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  const handleSearchChange: React.ChangeEventHandler<HTMLInputElement> =
    useCallback(e => {
      setSearch(e.target.value);
    }, []);

  return (
    <Flex
      direction="column"
      style={{
        height: "100%",
      }}
    >
      <Box>
        <TextInput
          m="xs"
          variant="filled"
          value={search}
          onChange={handleSearchChange}
          placeholder={t`Search for something`}
          leftSection={<Icon name="search" />}
        />
      </Box>
      <Flex
        direction="column"
        pt="sm"
        px="sm"
        style={{
          overflowY: "auto",
        }}
      >
        <SearchResultsList
          search={debouncedSearch}
          mode={activeTab === "explore" ? "both" : "add"}
        />
      </Flex>
    </Flex>
  );
};
