import { useCallback, useMemo } from "react";
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
import * as Urls from "metabase/utils/urls";
import {
  useDeleteCustomVizPluginMutation,
  useListAllCustomVizPluginsQuery,
} from "metabase-enterprise/api";
import type { CustomVizPluginId } from "metabase-types/api";

import { CustomVizListItem } from "./CustomVizListItem";
import S from "./ManageCustomVizPage.module.css";

export function ManageCustomVizPage() {
  const { data: plugins, isLoading } = useListAllCustomVizPluginsQuery();
  const [deletePlugin] = useDeleteCustomVizPluginMutation();

  const repoPlugins = useMemo(
    () => plugins?.filter((p) => !p.dev_only),
    [plugins],
  );

  const handleDelete = useCallback(
    async (id: CustomVizPluginId) => {
      await deletePlugin(id).unwrap();
    },
    [deletePlugin],
  );

  return (
    <SettingsPageWrapper>
      <Stack gap="0">
        <Flex justify="space-between">
          <Title order={1} style={{ alignItems: "center", height: "2.5rem" }}>
            {t`Custom visualizations`}
          </Title>
          <Button
            component={Link}
            to={Urls.customVizAdd()}
            leftSection={<Icon name="add" />}
            variant="filled"
          >
            {t`Add`}
          </Button>
        </Flex>

        <Text c="text-secondary" maw="40rem">
          {t`Add custom visualizations to your instance here by adding links to git repositories containing custom visualization bundles.`}
        </Text>
      </Stack>

      {isLoading && (
        <Flex justify="center" p="xl">
          <Loader />
        </Flex>
      )}

      {repoPlugins && repoPlugins.length === 0 && !isLoading && (
        <Group
          align="center"
          bd="1px solid var(--mb-color-border)"
          bdrs="md"
          bg="background-primary"
          justify="center"
          mih="15rem"
          p="xl"
        >
          <Text c="text-tertiary">{t`You don't have any custom visualizations.`}</Text>
        </Group>
      )}

      {repoPlugins && repoPlugins.length > 0 && (
        <Box
          bd="1px solid var(--mb-color-border)"
          bdrs="md"
          bg="background-primary"
          className={S.pluginList}
          style={{
            overflow: "hidden",
          }}
        >
          {repoPlugins.map((plugin) => (
            <CustomVizListItem
              key={plugin.id}
              plugin={plugin}
              onDelete={handleDelete}
            />
          ))}
        </Box>
      )}
    </SettingsPageWrapper>
  );
}
