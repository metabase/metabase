import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  type VisualizerSearchParams,
  useVisualizerSearchQuery,
} from "metabase/api";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  Box,
  Center,
  Flex,
  Icon,
  Loader,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import {
  getDataSources,
  getVisualizationType,
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { canCombineCard, createDataSource } from "metabase/visualizer/utils";
import {
  addDataSource,
  removeDataSource,
} from "metabase/visualizer/visualizer.slice";
import type { DatasetColumn, VisualizationDisplay } from "metabase-types/api";
import type { VisualizerDataSource } from "metabase-types/store/visualizer";

import { DataTypeStack } from "./DataTypeStack";

type DataImporterListItem = {
  dataSource: VisualizerDataSource;
  columns: DatasetColumn[];
  location: string;
  isCompatible: boolean;
};

export const DataImporter = () => {
  const display = useSelector(getVisualizationType);
  const columns = useSelector(getVisualizerDatasetColumns);
  const dataSources = useSelector(getDataSources);
  const settings = useSelector(getVisualizerComputedSettings);
  const dispatch = useDispatch();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  const { data: result = [] } = useVisualizerSearchQuery(
    getSearchQuery(debouncedSearch, display, columns),
    {
      refetchOnMountOrArgChange: true,
    },
  );

  const items: DataImporterListItem[] = useMemo(() => {
    const isEmpty = columns.length === 0;
    return result.map(cardLike => {
      const card = {
        ...cardLike,
        result_metadata: JSON.parse(cardLike.result_metadata),
        visualization_settings: JSON.parse(cardLike.visualization_settings),
      };
      const isCompatible =
        isEmpty ||
        Boolean(
          display &&
            ["line", "area", "bar"].includes(display) &&
            canCombineCard(display, columns, settings, card),
        );
      return {
        dataSource: createDataSource("card", card.id, card.name),
        location: card.collection?.name ?? t`Our analytics`,
        columns: card.result_metadata,
        isCompatible,
      };
    });
  }, [result, display, columns, settings]);

  const dataSourceIds = useMemo(
    () => new Set(dataSources.map(s => s.id)),
    [dataSources],
  );

  const handleDataSourceSelect = useCallback(
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
          borderBottom: "1px solid var(--mb-color-border)",
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
        {items.length > 0 ? (
          <Box component="ul">
            {items.map(item => (
              <ListItem
                key={item.dataSource.id}
                item={item}
                isSelected={dataSourceIds.has(item.dataSource.id)}
                onSelect={() => handleDataSourceSelect(item.dataSource)}
              />
            ))}
          </Box>
        ) : (
          <Center>
            <Loader />
          </Center>
        )}
      </Flex>
    </Flex>
  );
};

type ListItemProps = {
  item: DataImporterListItem;
  isSelected: boolean;
  onSelect: () => void;
};

function ListItem({
  item: { dataSource, location, columns, isCompatible },
  isSelected,
  onSelect,
}: ListItemProps) {
  const isMuted = !isCompatible && !isSelected;
  return (
    <Box
      component="li"
      px={14}
      py={10}
      mb={4}
      style={{
        border: "1px solid var(--mb-color-border)",
        borderRadius: 5,
        cursor: "pointer",
        backgroundColor: isSelected
          ? "var(--mb-color-bg-medium)"
          : "transparent",
        opacity: isMuted ? 0.5 : 1,
      }}
      onClick={onSelect}
    >
      <Flex direction="row" align="center" justify="space-between" w="100%">
        <Stack spacing="xs" maw="75%">
          <Text truncate fw="bold">
            {dataSource.name}
          </Text>
          <Text truncate c="text-medium" size="sm">
            {location}
          </Text>
        </Stack>
        <DataTypeStack columns={columns} />
      </Flex>
    </Box>
  );
}

function getSearchQuery(
  search: string | undefined,
  display: VisualizationDisplay | null,
  columns: DatasetColumn[],
) {
  const query: VisualizerSearchParams = {
    display,
    "dataset-columns": columns,
  };
  if (search && search.length > 0) {
    query.search = search;
  }
  return query;
}
