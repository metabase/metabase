import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import {
  useDeleteCustomVizPluginMutation,
  useListAllCustomVizPluginsQuery,
} from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { Box, Button, Flex, Icon, Loader, Text } from "metabase/ui";
import type { CustomVizPluginId } from "metabase-types/api";

import S from "./CustomVizPluginsSettingsPage.module.css";
import { PluginListItem } from "./PluginListItem";

const BASE_PATH = "/admin/settings/custom-visualizations";

export function ManageCustomVisualizationsPage() {
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
    <SettingsPageWrapper
      title={t`Manage custom visualizations`}
      description={t`Add custom visualizations to your instance here by adding links to git repositories containing custom visualization bundles.`}
    >
      <Flex justify="flex-end">
        <Button
          component={Link}
          to={`${BASE_PATH}/new`}
          variant="filled"
          leftSection={<Icon name="add" />}
        >
          {t`Add visualization`}
        </Button>
      </Flex>

      {isLoading && (
        <Flex justify="center" p="xl">
          <Loader />
        </Flex>
      )}

      {repoPlugins && repoPlugins.length === 0 && !isLoading && (
        <Box
          bdrs="md"
          bg="background-primary"
          p="xl"
          style={{
            minHeight: "20rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text c="text-tertiary">{t`You don't have any custom visualizations.`}</Text>
        </Box>
      )}

      {repoPlugins && repoPlugins.length > 0 && (
        <Box
          bdrs="md"
          bg="background-primary"
          className={S.pluginList}
          style={{
            overflow: "hidden",
          }}
        >
          {repoPlugins.map((plugin) => (
            <PluginListItem
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
