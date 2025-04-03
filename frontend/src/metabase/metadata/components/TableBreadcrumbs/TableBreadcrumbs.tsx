import {
  skipToken,
  useGetTableQuery,
  useListDatabaseSchemasQuery,
} from "metabase/api";
import { Flex, Group, Icon } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface Props {
  className?: string;
  hideTableName?: boolean;
  tableId: TableId;
}

export const TableBreadcrumbs = ({
  className,
  hideTableName,
  tableId,
}: Props) => {
  const { data: table } = useGetTableQuery({ id: tableId });

  const { data: schemas, isLoading: isLoadingSchemas } =
    useListDatabaseSchemasQuery(
      table && table.db_id && table.schema ? { id: table.db_id } : skipToken,
    );

  if (!table || !table.db || isLoadingSchemas) {
    return null;
  }

  return (
    <Group align="center" className={className} gap="sm">
      <Group align="center" gap="xs">
        <Flex c="brand">
          <Icon name="database" />
        </Flex>

        {table.db.name}
      </Group>

      {schemas && schemas.length > 1 && table.schema && (
        <>
          <Separator />

          <Group align="center" gap="xs">
            <Flex c="brand">
              <Icon name="folder" />
            </Flex>

            {table.schema}
          </Group>
        </>
      )}

      {!hideTableName && (
        <>
          <Separator />

          <Group align="center" gap="xs">
            <Flex c="brand">
              <Icon name="table" />
            </Flex>

            {table.display_name}
          </Group>
        </>
      )}
    </Group>
  );
};

const Separator = () => <span>/</span>;
