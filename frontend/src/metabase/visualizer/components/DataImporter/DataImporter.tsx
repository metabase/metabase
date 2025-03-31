import { useCallback, useState } from "react";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { Box, Flex, Icon, Tabs, TextInput } from "metabase/ui";

import { SearchResultsList } from "./SearchResultsList";

export const DataImporter = () => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string | null>("compare");
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
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List grow justify="space-between">
            <Tabs.Tab value="compare">Compare</Tabs.Tab>
            <Tabs.Tab value="explore">Explore</Tabs.Tab>
          </Tabs.List>
        </Tabs>
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
