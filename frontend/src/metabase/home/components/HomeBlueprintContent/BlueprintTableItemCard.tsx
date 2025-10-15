import { Flex, Icon, Title, Text, Anchor } from "metabase/ui";
import { Table } from "metabase-types/api";
import * as Urls from "metabase/lib/urls";

export const BlueprintTableItemCard = ({ table }: { table: Table }) => {
  return (
    <Anchor
      href={Urls.tableRowsQuery(table.db_id, table.id)}
      td="none"
      w="100%"
      h="100%"
    >
      <Flex
        w="100%"
        h="100%"
        bg="bg-white"
        p="md"
        bdrs="12px"
        style={{
          border: "1px solid var(--mb-color-border)",
        }}
        direction="row"
        align={table.description ? undefined : "center"}
      >
        <Icon
          name="table"
          size={16}
          c="rgba(53, 140, 217, 1)"
          mr="sm"
          style={{ flexShrink: 0 }}
        />
        <Flex direction="column" style={{ minWidth: 0, flex: 1 }}>
          <Title
            order={4}
            mb={table.description ? "sm" : undefined}
            c="text-primary"
            fz={14}
            fw={400}
            lh="16px"
            lineClamp={1}
          >
            {table.display_name ?? table.name}
          </Title>
          {table.description && (
            <Text
              fz={12}
              lh="16px"
              fw={400}
              c="text-secondary"
              tt="none"
              lineClamp={1}
            >
              {table.description}
            </Text>
          )}
        </Flex>
      </Flex>
    </Anchor>
  );
};
