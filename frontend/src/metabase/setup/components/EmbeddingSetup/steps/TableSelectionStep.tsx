import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { groupBy } from "underscore";

import { databaseApi } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { isSyncInProgress } from "metabase/lib/syncing";
import {
  Box,
  Button,
  Center,
  Checkbox,
  Group,
  Icon,
  Loader,
  Space,
  Stack,
  type StackProps,
  Text,
  TextInput,
  Title,
} from "metabase/ui";
import type { Table } from "metabase-types/api";

import { useEmbeddingSetup } from "../EmbeddingSetupContext";
import { useForceLocaleRefresh } from "../useForceLocaleRefresh";

export const TableSelectionStep = () => {
  useForceLocaleRefresh();

  const [tables, setTables] = useState<Table[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const dispatch = useDispatch();
  const {
    database,
    selectedTables,
    setSelectedTables,
    setProcessingStatus,
    goToNextStep,
  } = useEmbeddingSetup();

  const getDatabaseTables = useCallback(async () => {
    const data = await dispatch(
      databaseApi.endpoints.getDatabaseMetadata.initiate(
        {
          id: database!.id!,
        },
        {
          forceRefetch: true,
        },
      ),
    ).unwrap();
    if (!data || !data.tables || data.tables.length === 0) {
      throw new Error("No tables found");
    }
    return data.tables as Table[];
  }, [database, dispatch]);

  const fetchTables = useCallback(async () => {
    const tables = await retry({
      fn: getDatabaseTables,
      maxTries: 10,
      retryDelay: 1000,
      onMaxTries: ({ maxTries }) => {
        setError(t`Failed to fetch tables after ${maxTries} attempts`);
      },
    });
    setTables(tables || []);
  }, [getDatabaseTables]);

  const waitForDbSync = useCallback(async () => {
    await retry({
      fn: async () => {
        const { data: databases } = await dispatch(
          databaseApi.endpoints.listDatabases.initiate(
            {},
            { forceRefetch: true },
          ),
        ).unwrap();

        const userDatabases =
          databases?.filter((database) => !database.is_sample) || [];

        if (userDatabases.length === 0) {
          throw new Error("No databases found");
        }

        if (userDatabases.some((database) => isSyncInProgress(database))) {
          throw new Error("Databases are syncing");
        }
      },
      maxTries: 60,
      retryDelay: 1000,
      onMaxTries: ({ maxTries }) => {
        setError(t`Failed to sync database after ${maxTries} attempts`);
      },
    });
  }, [dispatch]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      await waitForDbSync();
      await fetchTables();
      setIsLoading(false);
    };
    fetchData();
  }, [fetchTables, waitForDbSync]);

  const handleManualRefresh = () => {
    fetchTables();
    setError(null);
  };

  const handleTableToggle = (table: Table) => {
    if (selectedTables.some((t) => t.id === table.id)) {
      setSelectedTables(selectedTables.filter((t) => t.id !== table.id));
    } else if (selectedTables.length < 3) {
      setSelectedTables([...selectedTables, table]);
    }
  };

  const handleSubmit = () => {
    setProcessingStatus("Creating models and dashboards...");
    goToNextStep();
  };

  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      const isSelected = selectedTables.some((t) => t.id === table.id);
      const isSearchMatch = table.name
        .toLowerCase()
        .includes(search.toLowerCase());
      return isSelected || isSearchMatch;
    });
  }, [tables, search, selectedTables]);

  const tablesBySchema = useMemo(
    () => groupBy(filteredTables, "schema"),
    [filteredTables],
  );

  if (isLoading) {
    return (
      <FullHeightContainer ta="center" py="xl">
        <Center>
          <Loader size="lg" />
        </Center>
        <Stack gap="md" mt="md">
          <Text>{t`Waiting for tables to be available. This may take a few minutes as we wait for the database to sync.`}</Text>
        </Stack>
      </FullHeightContainer>
    );
  }

  if (error) {
    return (
      <FullHeightContainer ta="center" py="xl">
        <Text color="error">{error}</Text>
        <Button variant="outline" mt="md" onClick={handleManualRefresh}>
          {t`Try Again`}
        </Button>
      </FullHeightContainer>
    );
  }

  const hasResults = filteredTables.length > 0;

  return (
    <FullHeightContainer>
      <Title order={2} mb="lg">{t`Select Tables to Embed`}</Title>
      <Text mb="xl">
        {t`Choose up to 3 tables that you want to turn into models and dashboards. These will be used to create your initial embedded analytics.`}
      </Text>

      <TextInput
        leftSection={<Icon name="search" />}
        placeholder={t`Search tables`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="md"
        mb="md"
      />

      {hasResults ? (
        <>
          <Stack gap="md">
            {Object.entries(tablesBySchema).map(([schema, tables]) => (
              <Box key={schema}>
                <Text fw={600} mb="md">
                  {schema.charAt(0).toUpperCase() + schema.slice(1)}
                </Text>
                {tables.map((table) => (
                  <Checkbox
                    mb="md"
                    key={table.id}
                    label={table.name}
                    checked={selectedTables.some((t) => t.id === table.id)}
                    onChange={() => handleTableToggle(table)}
                    disabled={
                      selectedTables.length >= 3 &&
                      !selectedTables.some((t) => t.id === table.id)
                    }
                  />
                ))}
              </Box>
            ))}
          </Stack>

          <Space flex={1} />
        </>
      ) : (
        <Center flex={1}>
          <Text>{t`No tables found`}</Text>
        </Center>
      )}

      <Group justify="end" mt="xl">
        <Button onClick={handleSubmit} disabled={selectedTables.length === 0}>
          {t`Continue`}
        </Button>
      </Group>
    </FullHeightContainer>
  );
};

export const FullHeightContainer = ({
  children,
  ...props
}: {
  children: React.ReactNode;
} & StackProps) => {
  const yPadding = "8rem";

  const buffer = "2px";

  return (
    <Stack mih={`calc(100vh - ${yPadding} - ${buffer})`} {...props}>
      {children}
    </Stack>
  );
};

// Simple helper to retry if `fn` throws
// We can't easily use RTK built in helpers because we need to retry when we don't find the tables
const retry = async <T,>({
  fn,
  maxTries,
  retryDelay,
  onRetry,
  onMaxTries,
}: {
  fn: () => Promise<T>;
  maxTries: number;
  retryDelay: number;
  onRetry?: ({
    error,
    retryCount,
    maxTries,
  }: {
    error: any;
    retryCount: number;
    maxTries: number;
  }) => void;
  onMaxTries?: ({ maxTries }: { maxTries: number }) => void;
}) => {
  for (let i = 0; i < maxTries; i++) {
    try {
      return await fn();
    } catch (error) {
      onRetry?.({ error, retryCount: i, maxTries });
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
  onMaxTries?.({ maxTries });
};
