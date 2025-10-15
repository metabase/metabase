import { Flex, Grid, Icon, Text, Menu } from "metabase/ui";
import { Table } from "metabase-types/api";
import { BlueprintTableItemCard } from "./BlueprintTableItemCard";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";

export const TablesGrid = ({ tables }: { tables: Table[] }) => {
  const hasCollapsedTables = tables.length > 6;
  const visibleTables = hasCollapsedTables ? tables.slice(0, 5) : tables;
  const collapsedTables = hasCollapsedTables ? tables.slice(5) : [];

  const totalSlots = hasCollapsedTables ? 6 : Math.ceil(tables.length / 3) * 3;
  const itemCount = visibleTables.length + (hasCollapsedTables ? 1 : 0);
  const fillerCount = totalSlots - itemCount;

  return (
    <Grid pt="md" gutter="md">
      {visibleTables.map((table) => (
        <Grid.Col key={table.id} span={4}>
          <BlueprintTableItemCard table={table} />
        </Grid.Col>
      ))}
      {hasCollapsedTables && (
        <Grid.Col span={4}>
          <Menu position="bottom">
            <Menu.Target>
              <Flex
                bdrs="12px"
                w="100%"
                h="100%"
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
                  <Icon
                    size={10}
                    ml="xs"
                    name="chevrondown"
                    c="text-secondary"
                  />
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
        </Grid.Col>
      )}
      {Array.from({ length: fillerCount }).map((_, i) => (
        <Grid.Col key={`filler-${i}`} span={4} />
      ))}
    </Grid>
  );
};
