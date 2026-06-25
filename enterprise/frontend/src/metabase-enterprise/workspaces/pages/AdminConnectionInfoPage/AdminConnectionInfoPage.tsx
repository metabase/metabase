import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import {
  skipToken,
  useGetDatabaseQuery,
  useUpdateDatabaseMutation,
} from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import type { DatabaseFormConfig } from "metabase/databases/types";
import { useDispatch } from "metabase/redux";
import { Box, Flex, ScrollArea, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Database, DatabaseData } from "metabase-types/api";

const FORM_CONFIG: DatabaseFormConfig = {
  engine: {
    fieldState: "disabled",
  },
  name: {
    fieldState: "hidden",
  },
  isAdvanced: true,
};

type AdminConnectionInfoPageParams = {
  databaseId: string;
};

type AdminConnectionInfoPageProps = {
  params: AdminConnectionInfoPageParams;
  route: Route;
};

export function AdminConnectionInfoPage({
  params,
  route,
}: AdminConnectionInfoPageProps) {
  const databaseId = Urls.extractEntityId(params.databaseId);
  const {
    data: database,
    isLoading,
    error,
  } = useGetDatabaseQuery(databaseId != null ? { id: databaseId } : skipToken);

  if (isLoading || error != null || database == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <AdminConnectionInfoPageBody database={database} route={route} />;
}

type AdminConnectionInfoPageBodyProps = {
  database: Database;
  route: Route;
};

function AdminConnectionInfoPageBody({
  database,
  route,
}: AdminConnectionInfoPageBodyProps) {
  const title = getTitle(database);
  const initialValues = useMemo(() => getInitialValues(database), [database]);
  const [isDirty, setIsDirty] = useState(false);
  const [updateDatabase, { isLoading: isSaving }] = useUpdateDatabaseMutation();
  const dispatch = useDispatch();

  const handleSubmit = async (newValues: DatabaseData) => {
    await updateDatabase({
      id: database.id,
      admin_details: getSubmitDetails(newValues),
    }).unwrap();
    dispatch(push(Urls.viewDatabase(database.id)));
  };

  const handleCancel = () => {
    dispatch(push(Urls.viewDatabase(database.id)));
  };

  return (
    <Flex
      direction="row"
      h="100%"
      bg="background_page-secondary"
      data-testid="admin-connection-info-page"
    >
      <Box h="100%" w="100%" component={ScrollArea}>
        <Box w="100%" maw="54rem" mx="auto" p={{ base: "md", sm: "xl" }}>
          <Flex mb="lg" align="center">
            <Title order={1} fz="h2">
              {title}
            </Title>
          </Flex>
          <SettingsSection>
            <DatabaseForm
              initialValues={initialValues}
              config={FORM_CONFIG}
              location="full-page"
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              onDirtyStateChange={setIsDirty}
            />
          </SettingsSection>
        </Box>
      </Box>
      <LeaveRouteConfirmModal isEnabled={isDirty && !isSaving} route={route} />
    </Flex>
  );
}

function getTitle(database: Database): string {
  return database.admin_details == null
    ? t`Add admin connection`
    : t`Edit admin connection details`;
}

function getInitialValues(database: Database): DatabaseData {
  const { password: _password, ...details } = database.details ?? {};

  return {
    ...database,
    id: database.admin_details ? database.id : undefined,
    details: {
      ...details,
      ...database.admin_details,
      "admin-connection": true,
    },
  };
}

function getSubmitDetails(values: DatabaseData) {
  return values.details ?? {};
}
