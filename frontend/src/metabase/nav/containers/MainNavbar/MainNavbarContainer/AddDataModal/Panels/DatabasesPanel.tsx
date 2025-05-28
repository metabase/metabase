import { push } from "react-router-redux";
import { t } from "ttag";

import { DatabaseEngineList } from "metabase/databases/components/DatabaseEngineList";
import { useDispatch } from "metabase/lib/redux";
import { getSubpathSafeUrl } from "metabase/lib/urls";
import { Alert, Box, Center, Icon, Stack, Text, Title } from "metabase/ui";

export const DatabasesPanel = ({
  canSeeContent,
}: {
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
    <Stack gap="lg" align="center" justify="center" pt="3rem">
      <Center component="img" src={illustration} w="3rem" />
      <Box component="header" ta="center">
        <Title order={2} size="h4" mb="xs">{t`Add a database`}</Title>
        <Text
          maw="22.5rem"
          c="text-medium"
        >{t`Start exploring in minutes. We support more than 20 data connectors.`}</Text>
      </Box>
      <Alert icon={<Icon name="info_filled" />}>
        {t`To add a new database, please contact your administrator.`}
      </Alert>
    </Stack>
  );
};
