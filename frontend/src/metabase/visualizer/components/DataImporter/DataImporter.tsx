import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex, Icon, Text, TextInput } from "metabase/ui";
import { getDataSources } from "metabase/visualizer/selectors";
import {
  addDataSource,
  removeDataSource,
} from "metabase/visualizer/visualizer.slice";
import type { VisualizerDataSource } from "metabase-types/store/visualizer";

import { RecentsList } from "./RecentsList";
import type { ResultsListProps } from "./ResultsList";
import { SearchResultsList } from "./SearchResultsList";

export const DataImporter = () => {
  const dispatch = useDispatch();
  const dataSources = useSelector(getDataSources);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  const dataSourceIds = useMemo(
    () => new Set(dataSources.map(s => s.id)),
    [dataSources],
  );

  const handleDataSourceSelect: ResultsListProps["onSelect"] = useCallback(
    (source: VisualizerDataSource) => {
      if (dataSourceIds.has(source.id)) {
        dispatch(removeDataSource(source));
      } else {
        dispatch(addDataSource(source.id));
      }
    },
    [dataSourceIds, dispatch],
  );

  const handleSearchChange: React.ChangeEventHandler<HTMLInputElement> =
    useCallback(e => {
      setSearch(e.target.value);
    }, []);

  const showRecents = search.trim() === "";

  return (
    <Flex
      direction="column"
      bg="white"
      style={{
        borderRadius: "var(--default-border-radius)",
        height: "100%",
        border: `1px solid var(--mb-color-border)`,
      }}
    >
      <Box
        style={{
          borderBottom: `
        1px solid var(--mb-color-border)`,
        }}
      >
        <TextInput
          m="xs"
          variant="filled"
          value={search}
          onChange={handleSearchChange}
          placeholder={t`Search for something`}
          icon={<Icon name="search" />}
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
        {showRecents ? (
          <>
            <Text>{t`Recents`}</Text>
            <RecentsList
              onSelect={handleDataSourceSelect}
              dataSourceIds={dataSourceIds}
            />
          </>
        ) : (
          <SearchResultsList
            search={debouncedSearch}
            onSelect={handleDataSourceSelect}
            dataSourceIds={dataSourceIds}
          />
        )}
      </Flex>
    </Flex>
  );
};
