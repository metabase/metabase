import { useListDatabasesQuery } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { findDatabaseByName } from "metabase/common/utils/database";
import { useParams } from "metabase/router";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DatabaseId } from "metabase-types/api";

import S from "../components/BrowseContainer.module.css";
import { BrowseDataHeader } from "../components/BrowseDataHeader";

import { TableBrowser } from "./TableBrowser";

const BrowseTablesPage = ({
  dbId,
  schemaName,
}: {
  dbId: DatabaseId | string;
  schemaName: string;
}) => {
  return (
    <Flex
      className={S.browseContainer}
      flex={1}
      direction="column"
      wrap="nowrap"
      pt="md"
    >
      <BrowseDataHeader />
      <Flex className={S.browseMain} direction="column" wrap="nowrap" flex={1}>
        <Flex maw="64rem" mx="auto" w="100%" direction="column">
          <TableBrowser dbId={dbId} schemaName={schemaName} />
        </Flex>
      </Flex>
    </Flex>
  );
};

const BrowseTablesByDatabaseName = ({
  databaseName,
  schemaName,
}: {
  databaseName: string;
  schemaName: string;
}) => {
  const { data, error, isLoading } = useListDatabasesQuery();
  const database = findDatabaseByName(data?.data ?? [], databaseName);

  if (error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  if (!database) {
    return <NotFound />;
  }

  return <BrowseTablesPage dbId={database.id} schemaName={schemaName} />;
};

export const BrowseTables = () => {
  const { dbId = "", schemaName = "" } = useParams<{
    dbId: string;
    schemaName: string;
  }>();

  if (Urls.extractEntityId(dbId) == null) {
    return (
      <BrowseTablesByDatabaseName databaseName={dbId} schemaName={schemaName} />
    );
  }

  return <BrowseTablesPage dbId={dbId} schemaName={schemaName} />;
};
