import { useEffect, useState } from "react";
import { t } from "ttag";

import { useGetTableQuery } from "metabase/api";
import { color } from "metabase/lib/colors";
import { tableRowsQuery } from "metabase/lib/urls";
import {
  Box,
  Card,
  Group,
  Icon,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { Collection, TableId } from "metabase-types/api";

const LOCAL_STORAGE_KEY_PREFIX = "mb-transform-collection-link-";

type TransformTableLink = {
  tableId: TableId;
};

type TransformTablesSectionProps = {
  collection: Collection;
};

function getTransformTablesFromLocalStorage(
  collectionId: number | string,
): TransformTableLink[] {
  try {
    const links: TransformTableLink[] = [];
    // Scan through localStorage for any keys matching our prefix
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LOCAL_STORAGE_KEY_PREFIX)) {
        const tableId = parseInt(key.replace(LOCAL_STORAGE_KEY_PREFIX, ""), 10);
        if (isNaN(tableId)) {
          continue;
        }

        const value = localStorage.getItem(key);
        if (value) {
          try {
            const collections = JSON.parse(value);
            // Check if this collection is in the selected collections
            if (collections[collectionId]) {
              links.push({ tableId });
            }
          } catch (e) {
            console.error("Error parsing transform collection link", e);
          }
        }
      }
    }
    return links;
  } catch (e) {
    console.error("Error reading transform tables from localStorage", e);
    return [];
  }
}

export function TransformTablesSection({
  collection,
}: TransformTablesSectionProps) {
  const [transformTables, setTransformTables] = useState<TransformTableLink[]>(
    [],
  );

  useEffect(() => {
    if (collection?.id) {
      const links = getTransformTablesFromLocalStorage(collection.id);
      setTransformTables(links);
    } else {
      setTransformTables([]);
    }
  }, [collection?.id]);

  if (transformTables.length === 0) {
    return null;
  }

  return (
    <div>
      <Stack gap="sm" pb="md">
        <Group gap="sm">
          <Icon name="table2" color={color("brand")} />
          <Title order={4}>{t`Tables`}</Title>
        </Group>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md" mb="xl">
        {transformTables.map((link) => (
          <TransformTableCardWrapper
            key={link.tableId}
            tableId={link.tableId}
          />
        ))}
      </SimpleGrid>
    </div>
  );
}

function TransformTableCardWrapper({ tableId }: { tableId: TableId }) {
  const { data: table, isLoading, error } = useGetTableQuery({ id: tableId });

  if (isLoading) {
    return (
      <Box
        p="md"
        style={{
          border: `1px solid ${color("border")}`,
          borderRadius: "8px",
        }}
      >
        <Text>{t`Loading...`}</Text>
      </Box>
    );
  }

  if (error || !table) {
    return (
      <Box
        p="md"
        style={{
          border: `1px solid ${color("border")}`,
          borderRadius: "8px",
        }}
      >
        <Stack gap="xs">
          <Group gap="xs">
            <Icon name="warning" color={color("error")} />
            <Text fw={600}>{t`Transform Table ${tableId}`}</Text>
          </Group>
          <Text size="sm" c="error">
            {t`This table may have been deleted or you don't have access to it.`}
          </Text>
        </Stack>
      </Box>
    );
  }

  // Create a query URL that points to the table
  const queryUrl = tableRowsQuery(table.db_id, tableId);

  return (
    <Card p="md">
      <a size="xs" href={queryUrl} target="_blank">
        <Stack gap="sm">
          <Group gap="xs">
            <Icon name="table2" color={color("brand")} />
            <Text fw={600}>{table.display_name || table.name}</Text>
          </Group>

          {table.description && (
            <Text size="sm" c="dimmed">
              {table.description}
            </Text>
          )}

          <Text size="sm" c="dimmed">
            {table.schema ? `${table.schema}.${table.name}` : table.name}
          </Text>

          {t`Query this table`}
        </Stack>
      </a>
    </Card>
  );
}
