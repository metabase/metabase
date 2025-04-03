import { Flex, Group, Icon } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface Props {
  className?: string;
  hideTableCrumb?: boolean;
  tableId: TableId;
}

// TODO: separators
// TODO: remove css file

export const TableBreadcrumbs = ({
  className,
  hideTableCrumb,
  tableId,
}: Props) => {
  const databaseName = "Sample DB"; // TODO
  const databaseId = 1; // TODO
  const schemaName = "Schema"; // TODO
  const schemaId = "Domestic"; // TODO
  const tableName = "Table name"; // TODO

  return (
    <Group align="center" className={className} gap="sm">
      <Group align="center" gap="xs">
        <Flex c="brand">
          <Icon name="database" />
        </Flex>

        {databaseName}
      </Group>

      {schemaName && (
        <>
          <Separator />

          <Group align="center" gap="xs">
            <Flex c="brand">
              <Icon name="folder" />
            </Flex>

            {schemaName}
          </Group>
        </>
      )}

      {!hideTableCrumb && (
        <>
          <Separator />

          <Group align="center" gap="xs">
            <Flex c="brand">
              <Icon name="table" />
            </Flex>

            {tableName}
          </Group>
        </>
      )}
    </Group>
  );
};

// const Separator = () => (
//   <Flex c="text-medium">
//     <Icon name="chevronright" />
//   </Flex>
// );

const Separator = () => <span>/</span>;
