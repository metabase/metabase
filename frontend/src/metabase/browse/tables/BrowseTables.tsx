import { useEffect } from "react";
import { replace } from "react-router-redux";

import { useListDatabasesQuery } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { findDatabaseByName } from "metabase/common/utils/database";
import { useDispatch } from "metabase/redux";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/urls";

import S from "../components/BrowseContainer.module.css";
import { BrowseDataHeader } from "../components/BrowseDataHeader";

import { TableBrowser } from "./TableBrowser";

const SchemaNameRedirect = ({
  name,
  schemaName,
}: {
  name: string;
  schemaName: string;
}) => {
  const dispatch = useDispatch();
  const { data, isLoading } = useListDatabasesQuery();
  const database = findDatabaseByName(data?.data ?? [], name);

  useEffect(() => {
    if (database) {
      dispatch(
        replace(
          Urls.browseSchema({ db_id: database.id, schema_name: schemaName }),
        ),
      );
    }
  }, [database, schemaName, dispatch]);

  if (isLoading || database) {
    return <LoadingAndErrorWrapper loading />;
  }

  return <NotFound />;
};

export const BrowseTables = ({
  params: { dbId, schemaName },
}: {
  params: {
    dbId: string;
    schemaName: string;
  };
}) => {
  if (Urls.extractEntityId(dbId) == null) {
    return <SchemaNameRedirect name={dbId} schemaName={schemaName} />;
  }

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
