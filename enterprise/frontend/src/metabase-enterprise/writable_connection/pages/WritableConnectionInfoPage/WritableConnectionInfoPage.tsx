import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetDatabaseQuery,
  useUpdateDatabaseMutation,
} from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import type { DatabaseFormConfig } from "metabase/databases/types";
import { useNavigate, useParams } from "metabase/router";
import { SettingsSection } from "metabase/settings-components/SettingsSection";
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

type WritableConnectionInfoPageParams = {
  databaseId: string;
};

export function WritableConnectionInfoPage() {
  const params = useParams<WritableConnectionInfoPageParams>();
  const databaseId = Urls.extractEntityId(params.databaseId);
  const {
    data: database,
    isLoading,
    error,
  } = useGetDatabaseQuery(databaseId != null ? { id: databaseId } : skipToken);

  if (isLoading || error != null || database == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <WritableConnectionInfoPageBody database={database} />;
}

type WritableConnectionInfoPageBodyProps = {
  database: Database;
};

function WritableConnectionInfoPageBody({
  database,
}: WritableConnectionInfoPageBodyProps) {
  const title = getTitle(database);
  const initialValues = useMemo(() => getInitialValues(database), [database]);
  const [isDirty, setIsDirty] = useState(false);
  const [updateDatabase, { isLoading: isSaving }] = useUpdateDatabaseMutation();
  const navigate = useNavigate();

  const handleSubmit = async (newValues: DatabaseData) => {
    await updateDatabase({
      id: database.id,
      write_data_details: getSubmitDetails(newValues),
    }).unwrap();
    navigate(Urls.viewDatabase(database.id));
  };

  const handleCancel = () => {
    navigate(Urls.viewDatabase(database.id));
  };

  return (
    <Flex
      direction="row"
      h="100%"
      bg="background_page-secondary"
      data-testid="writable-connection-info-page"
    >
      <Box h="100%" w="100%" component={ScrollArea}>
        <Box w="100%" maw="54rem" mx="auto" p={{ base: "lg", sm: "xxl" }}>
          <Flex mb="xl" align="center">
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
      <LeaveRouteConfirmModal isEnabled={isDirty && !isSaving} />
    </Flex>
  );
}

function getTitle(database: Database): string {
  return database.write_data_details == null
    ? t`Add writable connection`
    : t`Edit writable connection details`;
}

function getInitialValues(database: Database): DatabaseData {
  const { password, ...details } = database.details ?? {};

  return {
    ...database,
    id: database.write_data_details ? database.id : undefined,
    details: {
      ...details,
      ...database.write_data_details,
      "write-data-connection": true,
    },
  };
}

function getSubmitDetails(values: DatabaseData) {
  return values.details ?? {};
}
