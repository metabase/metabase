import { useDisclosure } from "@mantine/hooks";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useSelector } from "metabase/lib/redux";
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
import { getDataSources } from "metabase/visualizer/selectors";

import { ColumnsList } from "./ColumnsList/ColumnsList";
import S from "./DataImporter.module.css";
import { DatasetsList } from "./DatasetsList/DatasetsList";

export const DataImporter = ({ className }: { className?: string }) => {
  const [search, setSearch] = useState("");
  const [activeTab] = useState<string | null>("explore");
  const [showDatasets, handlers] = useDisclosure(false);

  const dataSources = useSelector(getDataSources);

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  const handleSearchChange: React.ChangeEventHandler<HTMLInputElement> =
    useCallback(e => {
      setSearch(e.target.value);
    }, []);

  return (
    <Box
      className={`${className} ${S.DataImporter}`}
      bg="var(--mb-color-bg)"
      style={{ height: "100%" }}
      data-testid="visualizer-data-importer"
    >
      <Title order={4} mb="xs" className={S.Title}>
        {showDatasets ? t`Add data` : t`Manage data`}
      </Title>
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
              mode={activeTab === "explore" ? "both" : "add"}
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
            <ColumnsList />
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
