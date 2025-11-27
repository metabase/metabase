import { t } from "ttag";

import { Box, Loader, Stack, Text } from "metabase/ui";
import { useGetUnreferencedItemsQuery } from "metabase-enterprise/api";
import type { UnreferencedItem } from "metabase-types/api";

function getItemName(item: UnreferencedItem): string {
  if (item.type === "sandbox") {
    return item.data.table?.display_name ?? `Table ${item.data.table_id}`;
  }
  if (item.type === "table") {
    return item.data.display_name ?? item.data.name;
  }
  return item.data.name;
}

function getItemLocation(item: UnreferencedItem): string | null {
  switch (item.type) {
    case "card":
      return item.data.collection?.name ?? item.data.dashboard?.name ?? null;
    case "table":
      return item.data.db?.name
        ? `${item.data.db.name}${item.data.schema ? ` / ${item.data.schema}` : ""}`
        : null;
    case "dashboard":
    case "document":
      return item.data.collection?.name ?? null;
    case "transform":
      return item.data.table?.display_name ?? null;
    default:
      return null;
  }
}

export function UnreferencedItemsPage() {
  const { data, isLoading, error } = useGetUnreferencedItemsQuery({});

  if (isLoading) {
    return (
      <Box p="lg">
        <Loader />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p="lg">
        <Text c="error">{t`Error loading unreferenced items`}</Text>
      </Box>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <Box p="lg">
        <Text c="text-medium">{t`No unreferenced items found`}</Text>
      </Box>
    );
  }

  return (
    <Box p="lg">
      <Text fw="bold" mb="md">
        {t`${data.total} unreferenced items`}
      </Text>
      <Stack gap="xs">
        {data.data.map((item) => {
          const location = getItemLocation(item);
          return (
            <Box
              key={`${item.type}-${item.id}`}
              p="sm"
              bg="white"
              style={{ borderRadius: "var(--mb-radius-sm)" }}
            >
              <Text fw="bold">{getItemName(item)}</Text>
              <Text size="sm" c="text-medium">
                {item.type}
                {location ? ` • ${location}` : ""}
                {item.type !== "snippet" &&
                item.type !== "sandbox" &&
                item.type !== "transform" &&
                item.data.view_count != null
                  ? ` • ${item.data.view_count} views`
                  : ""}
              </Text>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
