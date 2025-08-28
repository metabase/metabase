import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import ActionButton from "metabase/common/components/ActionButton";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormSwitch,
} from "metabase/forms";
import { Box, Flex, Group, Icon, Stack, Text } from "metabase/ui";
import {
  useExportGitMutation,
  useImportGitMutation,
} from "metabase-enterprise/api";
import type { EnterpriseSettings } from "metabase-types/api";

export const GitSyncSettings = () => {
  const [importGit, { isLoading: isImporting }] = useImportGitMutation();
  const [exportGit, { isLoading: isExporting }] = useExportGitMutation();

  const isLoading = isImporting || isExporting;

  return (
    <SettingsPageWrapper title={t`Git sync settings`}>
      <SettingsSection
        title={t`Configure git`}
        description={
          <Stack gap="xs">
            <Text>
              {/* eslint-disable-next-line */}
              {t`Enable Git sync to back up and version control your Metabase library.`}
            </Text>
            <GitSyncStatus />
          </Stack>
        }
      >
        <AdminSettingInput
          name="git-sync-url"
          title={t`Git Url`}
          inputType="text"
        />
        <AdminSettingInput
          name="git-sync-key"
          title={t`RSA key`}
          inputType="textarea"
        />
      </SettingsSection>
      <SettingsSection
        title={t`Sync control`}
        description={t`Manually trigger a git sync to push any local changes to the remote repository and pull down any changes from the remote repository.`}
      >
        <Flex gap="md" align="end">
          <AdminSettingInput
            name="git-sync-branch"
            // eslint-disable-next-line
            description={t`Metabase will pull in all content from this branch`}
            title={t`Import branch`}
            inputType="text"
            w="20rem"
          />
          <ActionButton
            primary
            actionFn={() => importGit({}).unwrap()}
            variant="filled"
            failedText={t`Sync failed`}
            activeText={t`Syncing...`}
            successText={t`Synced`}
            useLoadingSpinner
            disabled={isLoading}
          >
            <Group align="center" gap="sm">
              <Icon name="download" />
              {t`Import`}
            </Group>
          </ActionButton>
        </Flex>
        <Flex gap="md" align="end">
          <AdminSettingInput
            name="git-sync-export-branch"
            // eslint-disable-next-line
            description={t`Metabase will save all content to this branch`}
            title={t`Export branch`}
            inputType="text"
            w="20rem"
          />
          <ActionButton
            primary
            actionFn={() => exportGit({}).unwrap()}
            variant="filled"
            failedText={t`Sync failed`}
            activeText={t`Syncing...`}
            successText={t`Synced`}
            useLoadingSpinner
            disabled={isLoading}
          >
            <Group align="center" gap="sm">
              <Icon name="upload" />
              {t`Export`}
            </Group>
          </ActionButton>
        </Flex>
      </SettingsSection>

      <GitSyncEntities />
    </SettingsPageWrapper>
  );
};

const GitSyncStatus = () => {
  const syncStatus = useSetting("git-sync-configured");

  const color = syncStatus ? "success" : "error";
  const message = syncStatus
    ? t`Git sync is configured.`
    : t`Git sync is not configured.`;

  return (
    <Flex align={"center"}>
      <Box bdrs="50%" h="14" w="14" mr="sm" bg={color} />
      <Text c="text-medium">{message}</Text>
    </Flex>
  );
};

const GitSyncEntities = () => {
  const {
    value: entities,
    isLoading,
    updateSetting,
  } = useAdminSetting("git-sync-entities");

  const handleSubmit = (settings: EnterpriseSettings["git-sync-entities"]) => {
    updateSetting({
      key: "git-sync-entities",
      value: settings,
    });
  };

  if (isLoading) {
    return <LoadingAndErrorWrapper loading={isLoading} />;
  }

  return (
    <SettingsSection title={t`Entities to sync`}>
      <FormProvider
        onSubmit={handleSubmit}
        initialValues={entities || {}}
        enableReinitialize
      >
        <Form>
          <Stack gap="sm">
            <FormSwitch name="transform" label={t`Transforms`} />
            <FormSwitch name="snippet" label={t`SQL Snippets`} disabled />
            <FormSwitch name="dataset" label={t`Models`} disabled />
            <FormSwitch name="metric" label={t`Metrics`} disabled />
            <FormSwitch name="dashboard" label={t`Dashboards`} disabled />
            <FormSwitch name="question" label={t`Questions`} disabled />
          </Stack>
          <Flex justify="end" mt="md">
            <FormSubmitButton label={t`Save changes`} variant="filled" />
          </Flex>
        </Form>
      </FormProvider>
    </SettingsSection>
  );
};
