import { push } from "react-router-redux";
import { c, t } from "ttag";

import { DatabaseEngineList } from "metabase/databases/components/DatabaseEngineList";
import { useDispatch } from "metabase/lib/redux";
import { getSubpathSafeUrl } from "metabase/lib/urls";
import { Alert, Box, Center, Icon, Stack, Text, Title } from "metabase/ui";

export const DatabasesPanel = ({
  adminEmail,
  canSeeContent,
}: {
  adminEmail: string;
  canSeeContent: boolean;
}) => {
  const dispatch = useDispatch();

  const handleDatabaseSelect = (key: string) => {
    dispatch(push(`/admin/databases/create?engine=${key}`));
  };

  const illustration = getSubpathSafeUrl(
    "app/assets/img/empty-states/databases.svg",
  );

  return canSeeContent ? (
    <DatabaseEngineList onSelect={handleDatabaseSelect} />
  ) : (
    <Stack gap="lg" align="center" justify="center" pt="3rem" maw="22.5rem">
      <Center component="img" src={illustration} w="3rem" />
      <Box component="header" ta="center">
        <Title order={2} size="h4" mb="xs">{t`Add a database`}</Title>
        <Text c="text-medium">{t`Start exploring in minutes. We support more than 20 data connectors.`}</Text>
      </Box>
      <Alert icon={<Icon name="info_filled" />}>
        <Text fz="md" lh="lg">
          {c("${0} is admin's email address")
            .jt`To add a new database, please contact your administrator at ${(<b key="admin-email">{adminEmail}</b>)}.`}
        </Text>
      </Alert>
    </Stack>
  );
};
