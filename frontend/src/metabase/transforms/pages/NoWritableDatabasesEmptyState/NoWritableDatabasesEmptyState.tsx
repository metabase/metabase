import { Link } from "react-router";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Button, Center, Icon, Stack, Text, Title } from "metabase/ui";
import { useSelector } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";

export function NoWritableDatabasesEmptyState() {
  const isAdmin = useSelector(getUserIsAdmin);
  const user = useSelector(getUser);
  const canAccessDatabases =
    isAdmin || user?.permissions?.can_access_db_details;

  return (
    <PageContainer data-testid="no-writable-databases-empty-state">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Transforms`}</DataStudioBreadcrumbs>
        }
      />
      <Center flex={1}>
        <Stack align="center" maw="30rem" gap="md">
          <Icon name="database" size={48} c="text-tertiary" />
          <Title
            order={3}
            ta="center"
          >{t`To use transforms, you need a writable database connection`}</Title>
          <Text ta="center" c="text-secondary">
            {t`None of your connected databases have a writable connection. Either edit the connection on the database you want to enable transforms on, or connect to a different database.`}
          </Text>
          {canAccessDatabases && (
            <Button
              component={Link}
              to={Urls.viewDatabases()}
              variant="filled"
            >{t`View your database connections`}</Button>
          )}
        </Stack>
      </Center>
    </PageContainer>
  );
}
