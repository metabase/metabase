import { Flex, Icon, Stack, Text, Menu } from "metabase/ui";
import { Table } from "metabase-types/api";
import { BlueprintTableItemCard } from "./BlueprintTableItemCard";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";

export const TablesGrid = ({ tables }: { tables: Table[] }) => {
  const topRow = tables.slice(0, 3);
  const hasCollapsedTables = tables.length > 6;
  const bottomRow = hasCollapsedTables ? tables.slice(3, 5) : tables.slice(3);
  const collapsedTables = hasCollapsedTables ? tables.slice(5) : [];

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
        {hasCollapsedTables && (
          <Menu position="bottom">
            <Menu.Target>
              <Flex
                bdrs="12px"
                w="100%"
                h="70px"
                bg="rgba(7, 23, 34, 0.02)"
                style={{
                  border: "1px solid var(--mb-color-border)",
                  cursor: "pointer",
                }}
                direction="row"
                align="center"
                justify="center"
              >
                <Text c="text-secondary">
                  {t`Show all`}{" "}
                  <Icon size={10} ml="xs" name="chevrondown" c="text-secondary" />
                </Text>
              </Flex>
            </Menu.Target>
            <Menu.Dropdown>
              {collapsedTables.map((table) => (
                <Menu.Item
                  key={table.id}
                  component="a"
                  href={Urls.tableRowsQuery(table.db_id, table.id)}
                  leftSection={<Icon name="table" size={16} />}
                >
                  {table.name}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
      </Flex>
    </Stack>
  );
};
