import { useDisclosure } from "@mantine/hooks";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  Box,
  Button,
  Center,
  Flex,
  Icon,
  Text,
  TextInput,
  Title,
} from "metabase/ui";
import { useBooleanMap } from "metabase/visualizer/hooks/use-boolean-map";
import { getDataSources } from "metabase/visualizer/selectors";
import { removeDataSource } from "metabase/visualizer/visualizer.slice";
import type { VisualizerDataSource } from "metabase-types/api";

import { ColumnsList } from "./ColumnsList/ColumnsList";
import S from "./DataImporter.module.css";
import { DatasetsList } from "./DatasetsList/DatasetsList";

export const DataImporter = ({ className }: { className?: string }) => {
  const [search, setSearch] = useState("");
  const [showDatasets, handlers] = useDisclosure(false);
  const dispatch = useDispatch();

  const dataSources = useSelector(getDataSources);

  const onRemoveDataSource = useCallback(
    (source: VisualizerDataSource) => {
      if (dataSources.length === 1) {
        handlers.open();
      }

      dispatch(removeDataSource(source));
    },
    [dataSources.length, handlers, dispatch],
  );

  const {
    values: collapsedDataSources,
    toggle: toggleDataSource,
    setValue: setDataSourceCollapsed,
  } = useBooleanMap();

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  const handleSearchChange: React.ChangeEventHandler<HTMLInputElement> =
    useCallback((e) => {
      setSearch(e.target.value);
    }, []);

  return (
    <Box
      className={`${className} ${S.DataImporter}`}
      style={{ height: "100%" }}
      data-testid="visualizer-data-importer"
    >
      <Title order={4} mb="xs" className={S.Title}>
        {showDatasets ? t`Add data` : t`Manage data`}
      </Title>
      {dataSources.length > 0 && (
        <Button
          size="xs"
          variant="transparent"
          ml="auto"
          onClick={handlers.toggle}
          className={S.ToggleButton}
          aria-label={showDatasets ? t`Done` : t`Add more data`}
        >
          {showDatasets ? t`Done` : t`Add more data`}
        </Button>
      )}

      {showDatasets ? (
        <Flex
          direction="column"
          className={S.Content}
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
              autoFocus
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
            <DatasetsList
              search={debouncedSearch}
              setDataSourceCollapsed={setDataSourceCollapsed}
            />
          </Flex>
        </Flex>
      ) : (
        <Flex
          direction="column"
          className={S.Content}
          bg="white"
          style={{
            borderRadius: "var(--default-border-radius)",
            height: "100%",
            border: `1px solid var(--mb-color-border)`,
          }}
        >
          {dataSources.length > 0 ? (
            <ColumnsList
              collapsedDataSources={collapsedDataSources}
              toggleDataSource={toggleDataSource}
              onRemoveDataSource={onRemoveDataSource}
            />
          ) : (
            <Center h="100%" w="100%" mx="auto">
              <Text>{t`Pick a dataset first`}</Text>
            </Center>
          )}
        </Flex>
      )}
    </Box>
  );
};
