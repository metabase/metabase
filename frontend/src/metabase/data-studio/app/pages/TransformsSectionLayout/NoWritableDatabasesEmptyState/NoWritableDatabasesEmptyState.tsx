import { t } from "ttag";

import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useSelector } from "metabase/redux";
import { Link } from "metabase/router";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { TransformsHeader } from "metabase/transforms/components/TransformsHeader";
import { Button, Center, Icon, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";

export function NoWritableDatabasesEmptyState() {
  const isAdmin = useSelector(getUserIsAdmin);
  const user = useSelector(getUser);
  const canAccessDatabases =
    isAdmin || user?.permissions?.can_access_db_details;

  return (
    <PageContainer data-testid="no-writable-databases-empty-state">
      <TransformsHeader showTabs={false} />
      <Center flex={1}>
        <Stack align="center" maw="30rem" gap="md">
          <Icon name="database" size={48} c="text-disabled" />
          <Title
            order={3}
            ta="center"
          >{t`No compatible database connection`}</Title>
          <Text ta="center" c="text-secondary">
            {t`None of your connected databases can be used with transforms. Connect a compatible database or check that your existing databases meet the requirements.`}
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
