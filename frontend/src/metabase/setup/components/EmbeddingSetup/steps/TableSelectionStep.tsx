import { useCallback, useEffect, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { databaseApi } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import {
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";
import type { Table } from "metabase-types/api";

import { useEmbeddingSetup } from "../EmbeddingSetupContext";

const MAX_RETRIES = 30;
const RETRY_DELAY = 1000;

export const TableSelectionStep = () => {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [search, setSearch] = useState("");
  const dispatch = useDispatch();
  const { database, selectedTables, setSelectedTables, setProcessingStatus } =
    useEmbeddingSetup();

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
    setLoading(true);
    const tables = await retry({
      fn: getDatabaseTables,
      maxTries: MAX_RETRIES,
      retryDelay: RETRY_DELAY,
      onRetry: ({ retryCount }) => {
        setRetryCount(retryCount);
      },
      onMaxTries: () => {
        setError(t`Failed to fetch tables after ${MAX_RETRIES} attempts`);
      },
    });
    setLoading(false);
    setTables(tables || []);
  }, [getDatabaseTables]);

  useEffect(() => {
    // initial loading
    fetchTables();
  }, [fetchTables]);

  const handleManualRefresh = () => {
    setRetryCount(0);
    fetchTables();
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
    dispatch(push("/setup/embedding/processing"));
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

  if (loading) {
    return (
      <Box ta="center" py="xl">
        <Loader size="lg" />
        <Stack gap="md" mt="md">
          <Text>
            {retryCount > 0
              ? t`Waiting for tables to be available... (Attempt ${retryCount + 1} of ${MAX_RETRIES})`
              : t`Loading tables...`}
          </Text>
          {retryCount > 0 && (
            <Text size="sm" c="dimmed">
              {t`This may take a few minutes as we wait for the database to sync.`}
            </Text>
          )}
        </Stack>
      </Box>
    );
  }

  if (error) {
    return (
      <Box ta="center" py="xl">
        <Text color="error">{error}</Text>
        <Stack gap="md" mt="md">
          <Button variant="outline" onClick={handleManualRefresh}>
            {t`Try Again`}
          </Button>
          <Button
            onClick={() => dispatch(push("/setup/embedding/data-connection"))}
          >
            {t`Go Back`}
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box>
      <Title order={2} mb="lg">{t`Select Tables to Embed`}</Title>
      <Text mb="xl">
        {t`Choose up to 3 tables that you want to turn into models and dashboards. These will be used to create your initial embedded analytics.`}
      </Text>

      <TextInput
        placeholder={t`Search tables`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="md"
        mb="md"
      />

      <Stack gap="md">
        {filteredTables.map((table) => (
          <Checkbox
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
      </Stack>

      <Group justify="space-between" mt="xl">
        <Button
          variant="subtle"
          onClick={() => dispatch(push("/setup/embedding/data-connection"))}
        >
          {t`Back`}
        </Button>
        <Button onClick={handleSubmit} disabled={selectedTables.length === 0}>
          {t`Continue`}
        </Button>
      </Group>
    </Box>
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
  onRetry: ({
    error,
    retryCount,
    maxTries,
  }: {
    error: any;
    retryCount: number;
    maxTries: number;
  }) => void;
  onMaxTries: () => void;
}) => {
  for (let i = 0; i < maxTries; i++) {
    try {
      return await fn();
    } catch (error) {
      onRetry?.({ error, retryCount: i, maxTries });
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
  onMaxTries?.();
};
