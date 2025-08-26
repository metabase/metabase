import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormSwitch,
} from "metabase/forms";
import { Box, Flex, Stack, Text } from "metabase/ui";
import type { EnterpriseSettings } from "metabase-types/api";

export const GitSyncSettings = () => {
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
