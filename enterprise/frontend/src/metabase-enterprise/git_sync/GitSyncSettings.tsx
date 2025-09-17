import { useCallback, useMemo, useState } from "react";
import { jt, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/api";
import { useAdminSetting } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import {
  ActionIcon,
  Box,
  Flex,
  Group,
  Icon,
  Menu,
  Radio,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { useUpdateGitSyncSettingsMutation } from "metabase-enterprise/api/git-sync";
import type { EnterpriseSettings, SettingDefinition } from "metabase-types/api";

import { CollectionSyncManager } from "./CollectionSyncManager";
import { GIT_SYNC_SCHEMA } from "./constants";

const URL_KEY = "remote-sync-url";
const TOKEN_KEY = "remote-sync-token";
const TYPE_KEY = "remote-sync-type";
const BRANCH_KEY = "remote-sync-branch";

type GitSyncSettingsType = Pick<
  EnterpriseSettings,
  | "remote-sync-enabled"
  | "remote-sync-url"
  | "remote-sync-token"
  | "remote-sync-type"
  | "remote-sync-branch"
>;

export const GitSyncSettings = (): JSX.Element => {
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const [updateGitSyncSettings] = useUpdateGitSyncSettingsMutation();
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);

  const { updateSetting: updateEnabledSetting, updateSettings } =
    useAdminSetting("remote-sync-enabled");

  const initialValues = useMemo(() => {
    const values = GIT_SYNC_SCHEMA.cast(settingValues, { stripUnknown: true });
    return {
      ...values,
    };
  }, [settingValues]);

  // eslint-disable-next-line no-unconditional-metabase-links-render -- This links only shows for admins.
  const { url: docsUrl } = useDocsUrl(
    "installation-and-operation/remote-sync",
    {
      anchor: "remote-sync",
    },
  );

  const onSubmit = useCallback(
    (values: GitSyncSettingsType) => {
      return updateGitSyncSettings(values);
    },
    [updateGitSyncSettings],
  );

  const isGitSyncEnabled = useSetting("remote-sync-enabled");
  const isGitSyncConfigured = useSetting("remote-sync-configured");

  const handleToggleEnabled = useCallback(async () => {
    await updateEnabledSetting({
      key: "remote-sync-enabled",
      value: !isGitSyncEnabled,
    });
  }, [isGitSyncEnabled, updateEnabledSetting]);

  const handleDeactivate = useCallback(async () => {
    // Clear all git sync settings
    await updateSettings({
      "remote-sync-enabled": false,
      "remote-sync-url": null,
      "remote-sync-token": null,
      "remote-sync-type": null,
      "remote-sync-branch": null,
    } as Partial<EnterpriseSettings>);
    setIsDeactivateModalOpen(false);
  }, [updateSettings]);

  return (
    <SettingsPageWrapper title={t`Remote sync configuration`}>
      <SettingsSection>
        {isGitSyncConfigured && (
          <Flex justify="space-between" align="center" mb="md">
            <GitSyncStatus />
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" size="lg">
                  <Icon name="ellipsis" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={
                    <Icon name={isGitSyncEnabled ? "pause" : "play"} />
                  }
                  onClick={handleToggleEnabled}
                >
                  {isGitSyncEnabled ? t`Pause` : t`Resume`}
                </Menu.Item>
                <Menu.Item
                  leftSection={<Icon name="close" />}
                  onClick={() => setIsDeactivateModalOpen(true)}
                  c="danger"
                >
                  {t`Deactivate`}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Flex>
        )}
        <FormProvider
          initialValues={initialValues}
          enableReinitialize
          validationSchema={GIT_SYNC_SCHEMA}
          validationContext={settingValues}
          onSubmit={onSubmit}
        >
          {({ dirty }) => (
            <Form disabled={!dirty}>
              <Stack gap="md">
                <Title order={2}>{t`Git Sync`}</Title>
                {!isGitSyncConfigured && <GitSyncStatus />}
                <Text c="text-medium">
                  {/* eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins. */}
                  {t`Enable Git sync to back up and version control your Metabase library content including dashboards, questions, and collections.`}
                </Text>
                <Text c="text-medium">
                  {jt`To set up Git sync, you'll need to provide your Git repository URL and authentication token. Instructions on how to set this up can be found ${(
                    <ExternalLink key="link" href={docsUrl}>
                      {t`here`}
                    </ExternalLink>
                  )}.`}
                </Text>

                <FormTextInput
                  name={URL_KEY}
                  label={t`Git Repository URL`}
                  placeholder={t`https://github.com/yourcompany/metabase-library.git`}
                  {...getEnvSettingProps(settingDetails?.[URL_KEY])}
                />

                <FormTextInput
                  name={TOKEN_KEY}
                  label={t`Personal Access Token`}
                  description={t`A GitHub personal access token with repository write permissions`}
                  type="password"
                  {...getEnvSettingProps(settingDetails?.[TOKEN_KEY])}
                />

                <FormRadioGroup
                  name={TYPE_KEY}
                  label={t`Synchronization Type`}
                  description={t`Choose how to sync with Git. Import mode keeps collections in sync with Git and makes them read-only. Export mode lets you make changes and push them to Git manually.`}
                >
                  <Group mt="sm">
                    <Radio value="import" label={t`Import from Git`} />
                    <Radio value="export" label={t`Export to Git`} />
                  </Group>
                </FormRadioGroup>

                <FormTextInput
                  name={BRANCH_KEY}
                  label={t`Branch`}
                  description={t`Branch to pull content from`}
                  placeholder="main"
                  {...getEnvSettingProps(settingDetails?.[BRANCH_KEY])}
                />

                <Flex justify="end">
                  <FormSubmitButton
                    label={
                      isGitSyncEnabled ? t`Save changes` : t`Save and enable`
                    }
                    variant="filled"
                    disabled={!dirty}
                  />
                </Flex>
                <FormErrorMessage />
              </Stack>
            </Form>
          )}
        </FormProvider>
      </SettingsSection>

      {isGitSyncConfigured && settingValues?.[TYPE_KEY] === "export" && (
        <SettingsSection
          title={t`Collections`}
          description={t`Select top-level collections to sync with Git`}
        >
          <CollectionSyncManager />
        </SettingsSection>
      )}

      <ConfirmModal
        opened={isDeactivateModalOpen}
        title={t`Deactivate Git Sync?`}
        message={t`This will clear all your Git sync settings and stop syncing your library with Git.`}
        confirmButtonText={t`Deactivate`}
        onConfirm={handleDeactivate}
        onClose={() => setIsDeactivateModalOpen(false)}
      />
    </SettingsPageWrapper>
  );
};

const GitSyncStatus = () => {
  const syncStatus = useSetting("remote-sync-configured");
  const isEnabled = useSetting("remote-sync-enabled");

  const color = syncStatus ? "success" : "error";
  const message = syncStatus
    ? isEnabled
      ? t`Git sync is configured and enabled.`
      : t`Git sync is configured but disabled.`
    : t`Git sync is not configured.`;

  return (
    <Flex align={"center"}>
      <Box bdrs="50%" h="14" w="14" mr="sm" bg={color} />
      <Text c="text-medium">{message}</Text>
    </Flex>
  );
};

const getEnvSettingProps = (setting?: SettingDefinition) => {
  if (setting?.is_env_setting) {
    return {
      description: t`Using ${setting.env_name}`,
      readOnly: true,
    };
  }
  return {};
};
