import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import {
  useDeleteCustomVizPluginMutation,
  useListAllCustomVizPluginsQuery,
} from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { Box, Button, Flex, Group, Icon, Loader, Text } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
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
    <SettingsPageWrapper
      title={t`Manage custom visualizations`}
      description={t`Add custom visualizations to your instance here by adding links to git repositories containing custom visualization bundles.`}
    >
      <Flex justify="flex-end">
        <Button
          component={Link}
          to={Urls.customVizAdd()}
          leftSection={<Icon name="add" />}
          variant="filled"
        >
          {t`Add`}
        </Button>
      </Flex>

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
