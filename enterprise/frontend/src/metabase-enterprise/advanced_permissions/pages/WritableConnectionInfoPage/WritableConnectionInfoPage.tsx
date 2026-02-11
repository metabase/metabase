import { useMemo } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { DatabaseEditConnectionForm } from "metabase/admin/databases/components/DatabaseEditConnectionForm";
import {
  skipToken,
  useGetDatabaseQuery,
  useUpdateDatabaseMutation,
} from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type { DatabaseFormConfig } from "metabase/databases/types";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Box, Flex, ScrollArea, Title } from "metabase/ui";
import type { Database, DatabaseData } from "metabase-types/api";

const FORM_CONFIG: DatabaseFormConfig = {
  engine: {
    fieldState: "disabled",
  },
};

type WriteDataConnectionPageParams = {
  databaseId: string;
};

type WriteDataConnectionPageProps = {
  params: WriteDataConnectionPageParams;
  route: Route;
};

export function WriteDataConnectionPage({
  params,
  route,
}: WriteDataConnectionPageProps) {
  const databaseId = Urls.extractEntityId(params.databaseId);
  const {
    data: database,
    isLoading,
    error,
  } = useGetDatabaseQuery(databaseId != null ? { id: databaseId } : skipToken);

  if (isLoading || error != null || database == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <WriteDataConnectionPageBody database={database} route={route} />;
}

type WriteDataConnectionPageBodyProps = {
  database: Database;
  route: Route;
};

function WriteDataConnectionPageBody({
  database,
  route,
}: WriteDataConnectionPageBodyProps) {
  const title = getTitle(database);
  const databaseData = useMemo(() => getDatabaseData(database), [database]);
  const [updateDatabase] = useUpdateDatabaseMutation();
  const dispatch = useDispatch();

  const handleSaveDatabase = async (newDatabaseData: DatabaseData) => {
    await updateDatabase({
      id: database.id,
      write_data_details: newDatabaseData.details,
    }).unwrap();
    return { id: database.id };
  };

  const handleSubmitted = () => {
    dispatch(push(Urls.viewDatabase(database.id)));
  };

  const handleCancel = () => {
    dispatch(push(Urls.viewDatabase(database.id)));
  };

  return (
    <Flex direction="row" h="100%" bg="background-secondary">
      <Box h="100%" w="100%" component={ScrollArea}>
        <Box w="100%" maw="54rem" mx="auto" p={{ base: "md", sm: "xl" }}>
          <Flex mb="lg" align="center">
            <Title order={1} fz="h2">
              {title}
            </Title>
          </Flex>
          <SettingsSection>
            <DatabaseEditConnectionForm
              database={databaseData}
              route={route}
              config={FORM_CONFIG}
              formLocation="full-page"
              isAttachedDWH={database?.is_attached_dwh ?? false}
              handleSaveDb={handleSaveDatabase}
              onSubmitted={handleSubmitted}
              onCancel={handleCancel}
            />
          </SettingsSection>
        </Box>
      </Box>
    </Flex>
  );
}

function getTitle(database: Database): string {
  return database.write_data_details == null
    ? t`Add a writable connection`
    : t`Edit writable connection details`;
}

function getDatabaseData(database: Database): DatabaseData {
  return {
    ...database,
    details: database.write_data_details ?? database.details,
  };
}
