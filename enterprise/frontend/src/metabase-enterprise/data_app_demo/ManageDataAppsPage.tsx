import { useCallback } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { Link } from "metabase/common/components/Link";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import {
  useDeleteDataAppMutation,
  useListDataAppsQuery,
} from "metabase-enterprise/api";

import { DataAppListItem } from "./DataAppListItem";
import S from "./ManageDataAppsPage.module.css";

export function ManageDataAppsPage() {
  const { data: apps, isLoading } = useListDataAppsQuery();
  const [deleteDataApp] = useDeleteDataAppMutation();

  const handleDelete = useCallback(
    async (name: string) => {
      await deleteDataApp(name).unwrap();
    },
    [deleteDataApp],
  );

  return (
    <SettingsPageWrapper>
      <Stack gap="0">
        <Flex justify="space-between">
          <Title order={1} style={{ height: "2.5rem" }}>
            {t`Data apps`}
          </Title>
          <Group gap="xs">
            <Button
              component={Link}
              to="/admin/settings/data-apps/new"
              leftSection={<Icon name="add" />}
              variant="filled"
            >
              {t`Add`}
            </Button>
          </Group>
        </Flex>

        <Text c="text-secondary" maw="40rem">
          {t`Upload data-app bundles as a single index.js file. Each app is reachable at /data-app/:name.`}
        </Text>
      </Stack>

      {isLoading && (
        <Flex justify="center" p="xl">
          <Loader />
        </Flex>
      )}

      {apps && apps.length === 0 && !isLoading && (
        <Group
          align="center"
          bd="1px solid var(--mb-color-border)"
          bdrs="md"
          bg="background-primary"
          justify="center"
          mih="15rem"
          p="xl"
        >
          <Text c="text-tertiary">{t`You don't have any data apps yet.`}</Text>
        </Group>
      )}

      {apps && apps.length > 0 && (
        <Box
          bd="1px solid var(--mb-color-border)"
          bdrs="md"
          bg="background-primary"
          className={S.appList}
          style={{ overflow: "hidden" }}
        >
          {apps.map((app) => (
            <DataAppListItem key={app.id} app={app} onDelete={handleDelete} />
          ))}
        </Box>
      )}
    </SettingsPageWrapper>
  );
}
