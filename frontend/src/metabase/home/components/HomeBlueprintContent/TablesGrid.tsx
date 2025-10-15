import { Flex, Stack } from "metabase/ui";
import { Table } from "metabase-types/api";
import { BlueprintTableItemCard } from "./BlueprintTableItemCard";

export const TablesGrid = ({ tables }: { tables: Table[] }) => {
  const topRow = tables.slice(0, 3);
  const bottomRow = tables.slice(3, 6);

  return (
    <Stack gap="md" pt="md">
      <Flex gap="md">
        {topRow.map((table) => (
          <BlueprintTableItemCard key={table.id} table={table} />
        ))}
      </Flex>
      <Flex gap="md">
        {bottomRow.map((table) => (
          <BlueprintTableItemCard key={table.id} table={table} />
        ))}
      </Flex>
    </Stack>
  );
};
