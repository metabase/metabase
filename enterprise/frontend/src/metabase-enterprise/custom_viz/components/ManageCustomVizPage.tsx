import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import { Link } from "metabase/common/components/Link";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Box, Button, Flex, Group, Icon, Loader, Text } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import {
  useDeleteCustomVizPluginMutation,
  useListAllCustomVizPluginsQuery,
} from "metabase-enterprise/api";
import type { CustomVizPluginId } from "metabase-types/api";

import { trackCustomVizPluginDeleted } from "../analytics";

import { CustomVizListItem } from "./CustomVizListItem";
import S from "./ManageCustomVizPage.module.css";

const CUSTOM_VIZ_ENABLED_SETTING = "custom-viz-enabled";

export function ManageCustomVizPage() {
  const { value: isCustomVizEnabled } = useAdminSetting(
    CUSTOM_VIZ_ENABLED_SETTING,
  );
  const hasCustomVizFeature = useHasTokenFeature("custom-viz");

  return (
    <SettingsPageWrapper
      title={t`Manage custom visualizations`}
      description={t`Add custom visualizations to your instance here by adding links to git repositories containing custom visualization bundles.`}
    >
      <SettingsSection>
        <AdminSettingInput
          name={CUSTOM_VIZ_ENABLED_SETTING}
          title={t`Enable Custom Visualizations`}
          inputType="boolean"
          description={t`Should custom visualizations be enabled for this instance? Disabling this will reload the page.`}
        />
      </SettingsSection>

      {isCustomVizEnabled && hasCustomVizFeature && <CustomVizSettingsForm />}
    </SettingsPageWrapper>
  );
}

function CustomVizSettingsForm() {
  const { data: plugins, isLoading } = useListAllCustomVizPluginsQuery();
  const [deletePlugin] = useDeleteCustomVizPluginMutation();
  const handleDelete = useCallback(
    async (id: CustomVizPluginId) => {
      await deletePlugin(id).unwrap();
      trackCustomVizPluginDeleted();
    },
    [deletePlugin],
  );

  const repoPlugins = useMemo(
    () => plugins?.filter((p) => !p.dev_only),
    [plugins],
  );

  return (
    <SettingsSection>
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
    </SettingsSection>
  );
}
