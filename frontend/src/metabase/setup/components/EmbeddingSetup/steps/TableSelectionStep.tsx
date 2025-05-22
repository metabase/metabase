import { useEffect, useState } from "react";
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

export const TableSelectionStep = () => {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useDispatch();
  const { database, selectedTables, setSelectedTables, setProcessingStatus } =
    useEmbeddingSetup();

  useEffect(() => {
    const fetchTables = async () => {
      if (!database?.id) {
        setError("No database selected");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(
          `/api/database/${database.id}/metadata?include_hidden=true`,
        );
        if (!response.ok) {
          throw new Error("Failed to fetch tables");
        }
        const data = await response.json();

        if (!data.tables || !Array.isArray(data.tables)) {
          throw new Error("Invalid response format");
        }

        setTables(data.tables);
        setError(null);
      } catch (err) {
        setError("Failed to load tables. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchTables();
  }, [database?.id]);

  const handleTableToggle = (table: Table) => {
    setSelectedTables((prev: Table[]) => {
      const isSelected = prev.some((t: Table) => t.id === table.id);
      if (isSelected) {
        return prev.filter((t: Table) => t.id !== table.id);
      } else {
        if (prev.length >= 3) {
          return prev;
        }
        return [...prev, table];
      }
    });
  };

  const handleSubmit = () => {
    setProcessingStatus("Creating models and dashboards...");
    dispatch(push("/setup/embedding/processing"));
  };

  if (loading) {
    return (
      <Box ta="center" py="xl">
        <Loader size="lg" />
        <Text mt="md">{t`Loading tables...`}</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box ta="center" py="xl">
        <Text color="error">{error}</Text>
        <Button
          mt="md"
          onClick={() => dispatch(push("/setup/embedding/data-connection"))}
        >
          {t`Go Back`}
        </Button>
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
