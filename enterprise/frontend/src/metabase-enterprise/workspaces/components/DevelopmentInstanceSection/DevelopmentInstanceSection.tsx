import { Link } from "react-router";
import { jt, t } from "ttag";

import { useAdminSetting } from "metabase/api/utils/settings";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Anchor,
  Box,
  Card,
  Group,
  Stack,
  Switch,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { useGetCurrentWorkspaceQuery } from "metabase-enterprise/api";

export function DevelopmentInstanceSection() {
  const applicationName = useSelector(getApplicationName);
  const { value, updateSetting, isLoading } = useAdminSetting(
    "development-instance",
  );
  const { data: workspace } = useGetCurrentWorkspaceQuery();

  const isInWorkspace = workspace != null;
  const isDevelopmentInstance = value ?? false;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateSetting({
      key: "development-instance",
      value: event.currentTarget.checked,
    });
  };

  return (
    <Stack gap="md">
      <Card p="xl" shadow="none" withBorder>
        <Stack>
          <Group justify="space-between" align="center">
            <Title order={4}>{t`Development instance`}</Title>
            <Switch
              aria-label={t`Development instance`}
              checked={isDevelopmentInstance}
              disabled={isLoading || isInWorkspace}
              onChange={handleChange}
            />
          </Group>
          <Text c="text-secondary">
            {t`When enabled, this allows this ${applicationName} instance to enter a Workspace for testing transforms before syncing changes to your production instance. Only enable this if this instance is used for development.`}
          </Text>
          {isInWorkspace && (
            <Box
              bg="background-secondary"
              px="lg"
              py="md"
              bdrs="md"
              c="text-secondary"
            >
              {jt`This setting can't be disabled while this instance is in a ${(
                <Anchor
                  key="workspace-link"
                  component={Link}
                  to={Urls.workspaceInstance()}
                >
                  {t`Workspace`}
                </Anchor>
              )}.`}
            </Box>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
