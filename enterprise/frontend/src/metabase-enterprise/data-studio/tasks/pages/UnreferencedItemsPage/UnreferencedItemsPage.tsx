import { useState } from "react";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import {
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import { useGetUnreferencedItemsQuery } from "metabase-enterprise/api";

import { UnreferencedItemsTable } from "./UnreferencedItemsTable";

const SEARCH_DEBOUNCE_MS = 300;

export function UnreferencedItemsPage() {
  const [searchValue, setSearchValue] = useState("");
  const debouncedSearch = useDebouncedValue(searchValue, SEARCH_DEBOUNCE_MS);

  const { data, isLoading, error } = useGetUnreferencedItemsQuery({
    query: debouncedSearch || undefined,
  });

  if (error) {
    return (
      <Box p="lg">
        <Text c="error">{t`Error loading unreferenced items`}</Text>
      </Box>
    );
  }

  return (
    <Stack h="100%" p="lg" gap="md">
      <Flex gap="md" align="center">
        <TextInput
          flex={1}
          placeholder={t`Search...`}
          value={searchValue}
          onChange={(e) => setSearchValue(e.currentTarget.value)}
          leftSection={<Icon name="search" />}
        />
        <Button variant="default" leftSection={<Icon name="filter" />}>
          {t`Filter`}
        </Button>
      </Flex>
      {isLoading ? (
        <Box p="lg">
          <Loader />
        </Box>
      ) : !data || data.data.length === 0 ? (
        <Box p="lg">
          <Text c="text-medium">{t`No unreferenced items found`}</Text>
        </Box>
      ) : (
        <Box flex={1} mih={0}>
          <UnreferencedItemsTable items={data.data} />
        </Box>
      )}
    </Stack>
  );
}
