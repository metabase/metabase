import { t } from "ttag";

import { useListTablesQuery } from "metabase/api/table";
import { Box, Checkbox, Flex, Icon, Loader, Stack, Text } from "metabase/ui";

interface SearchNewProps {
  query: string;
  onSelect?: (tableId: number) => void;
}

export function SearchNew({ query, onSelect }: SearchNewProps) {
  const { data: tables, isLoading } = useListTablesQuery({
    term: query,
    visibility_type2: undefined,
  });

  if (isLoading) {
    return (
      <Flex justify="center" align="center" p="xl">
        <Loader />
      </Flex>
    );
  }

  if (!tables || tables.length === 0) {
    return (
      <Box p="xl">
        <Text c="text.2">{t`No tables found`}</Text>
      </Box>
    );
  }

  return (
    <Stack gap={0} px="xl">
      {tables.map((table) => {
        const breadcrumbs = `${table.db?.name} (${table.schema})`;

        return (
          <Flex key={table.id} py="xs" align="center" gap="sm">
            <Checkbox size="sm" />
            <Icon name="table2" color="var(--mb-color-text-light)" size={16} />
            <Text fw={500} style={{ flex: 1 }}>
              {table.display_name}
            </Text>
            <BreadCrumbs breadcrumbs={breadcrumbs} />
          </Flex>
        );
      })}
    </Stack>
  );
}

function BreadCrumbs({
  breadcrumbs,
  active = true,
}: {
  breadcrumbs: string;
  active?: boolean;
}) {
  if (!breadcrumbs) {
    return null;
  }

  return (
    <Text
      flex="0 0 auto"
      c={active ? "var(--mb-color-text-medium)" : "var(--mb-color-text-light)"}
      fz="0.75rem"
      lh="1rem"
      lineClamp={1}
      maw="40%"
    >
      {breadcrumbs}
    </Text>
  );
}
