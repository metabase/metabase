import { Flex, Icon, Title, Text } from "metabase/ui";
import { Table } from "metabase-types/api";

export const BlueprintTableItemCard = ({ table }: { table: Table }) => {
  return (
    <Flex
      w="100%"
      bg="bg-white"
      p="md"
      bdrs="12px"
      style={{
        border: "1px solid var(--mb-color-border)",
      }}
      direction="row"
    >
      <Icon name="table" size={16} c="rgba(53, 140, 217, 1)" mr="sm" />
      <Flex direction="column">
        <Title order={4} mb="sm" c="text-primary" fz={14} fw={400} lh="16px">
          {table.name}
        </Title>
        <Text fz={12} lh="16px" fw={400} c="text-secondary" tt="none">
          {table.description}
        </Text>
      </Flex>
    </Flex>
  );
};
