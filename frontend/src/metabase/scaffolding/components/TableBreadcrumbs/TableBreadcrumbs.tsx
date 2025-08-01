import { Link } from "react-router";

import { createMockMetadata } from "__support__/metadata";
import {
  skipToken,
  useGetTableQuery,
  useListDatabaseSchemasQuery,
} from "metabase/api";
import { Flex, Group, Icon, Text } from "metabase/ui";
import * as ML_Urls from "metabase-lib/v1/urls";
import type { Table, TableId } from "metabase-types/api";

import S from "./TableBreadcrumbs.module.css";

interface Props {
  className?: string;
  hideTableName?: boolean;
  tableId: TableId;
}

export const TableBreadcrumbs = ({
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
    <>
      <Group
        component={Link}
        to={`/browse/databases/${table.db_id}`}
        c="text-light"
        align="center"
        gap={10}
        className={S.breadcrumb}
        wrap="nowrap"
        fw={"bold"}
        style={{
          fontSize: 20,
        }}
      >
        <Flex>
          <Icon name="database" size={20} />
        </Flex>

        {table.db.name}
      </Group>

      {schemas && schemas.length > 1 && table.schema && (
        <>
          <Separator />

          <Group
            component={Link}
            to={`/browse/databases/${table.db_id}/schema/${table.schema}`}
            c="text-light"
            align="center"
            gap={10}
            className={S.breadcrumb}
            wrap="nowrap"
            fw={"bold"}
            style={{
              fontSize: 20,
            }}
          >
            {table.schema}
          </Group>
        </>
      )}

      {!hideTableName && (
        <>
          <Separator />

          <Group
            component={Link}
            to={getExploreTableUrl(table)}
            c="text-light"
            align="center"
            gap={10}
            className={S.breadcrumb}
            wrap="nowrap"
            fw={"bold"}
            style={{
              fontSize: 20,
            }}
          >
            {table.display_name}
          </Group>
        </>
      )}
    </>
  );
};

const Separator = () => (
  <Text c="text-light" pl={"0.5em"} pr={"0.5em"}>
    /
  </Text>
);

export function getExploreTableUrl(table: Table): string {
  const metadata = createMockMetadata({
    tables: table ? [table] : [],
  });
  const metadataTable = metadata?.table(table.id);
  const question = metadataTable?.newQuestion();

  if (!question) {
    throw new Error("Unable to create question");
  }

  return ML_Urls.getUrl(question);
}
