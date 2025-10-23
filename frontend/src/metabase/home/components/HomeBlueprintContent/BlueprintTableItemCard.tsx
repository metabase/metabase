import { Flex, Icon, Title, Anchor } from "metabase/ui";
import { Table } from "metabase-types/api";
import * as Urls from "metabase/lib/urls";
import { Ellipsified } from "metabase/common/components/Ellipsified";

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
          >
            <Ellipsified lines={1} showTooltip={false}>
              {table.display_name ?? table.name}
            </Ellipsified>
          </Title>
          {table.description && (
            <Ellipsified
              fz={12}
              lh="16px"
              fw={400}
              c="text-secondary"
              lines={1}
            >
              {table.description}
            </Ellipsified>
          )}
        </Flex>
      </Flex>
    </Anchor>
  );
};
