import { useCallback, useEffect, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import {
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { Table } from "metabase-types/api";

import { useEmbeddingSetup } from "../EmbeddingSetupContext";

const MAX_RETRIES = 10;
const RETRY_DELAY = 30000; // 30 seconds

export const TableSelectionStep = () => {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const dispatch = useDispatch();
  const { database, selectedTables, setSelectedTables, setProcessingStatus } =
    useEmbeddingSetup();

  const fetchTables = useCallback(async () => {
    if (!database?.id) {
      setError("No database selected");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/database/${database.id}/metadata`);
      if (!response.ok) {
        throw new Error("Failed to fetch tables");
      }
      const data = await response.json();

      // Check if we have tables in the response
      const tables = data.tables || [];
      if (tables.length === 0) {
        if (retryCount < MAX_RETRIES) {
          setRetryCount((prev) => prev + 1);
          return;
        } else {
          throw new Error("No tables found after multiple attempts");
        }
      }

      setTables(tables);
      setLoading(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  }, [database?.id, retryCount]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const startFetching = async () => {
      await fetchTables();
      if (loading && retryCount < MAX_RETRIES) {
        timeoutId = setTimeout(startFetching, RETRY_DELAY);
      }
    };

    startFetching();

    // Cleanup timeout on unmount or when dependencies change
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [database?.id, retryCount, fetchTables, loading]);

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

  if (loading) {
    return (
      <Box ta="center" py="xl">
        <Loader size="lg" />
        <Stack gap="md" mt="md">
          <Text>
            {retryCount > 0
              ? t`Waiting for tables to be available... (Attempt ${retryCount} of ${MAX_RETRIES})`
              : t`Loading tables...`}
          </Text>
          {retryCount > 0 && (
            <Text size="sm" c="dimmed">
              {t`This may take a few minutes as we wait for the database to sync.`}
            </Text>
          )}
          <Button variant="outline" onClick={handleManualRefresh} mt="md">
            {t`Refresh Now`}
          </Button>
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

      <Stack gap="md">
        {tables.map((table) => (
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
