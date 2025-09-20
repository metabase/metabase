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
import { isNotNull } from "metabase/lib/types";
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

interface GitSyncStatusBadgeProps {
  isEnabled: boolean;
}

const GitSyncStatusBadge = ({ isEnabled }: GitSyncStatusBadgeProps) => (
  <Box
    py="xs"
    px="sm"
    bg={isEnabled ? "brand-lighter" : "bg-light"}
    c={isEnabled ? "brand" : "error"}
    fz="sm"
    fw={600}
  >
    {isEnabled ? t`Active` : t`Paused`}
  </Box>
);

interface GitSyncMenuProps {
  isEnabled: boolean;
  onToggle: () => void;
  onDeactivate: () => void;
}

const GitSyncMenu = ({
  isEnabled,
  onToggle,
  onDeactivate,
}: GitSyncMenuProps) => {
  const menuItems = useMemo(
    () =>
      [
        {
          title: isEnabled ? t`Pause Sync` : t`Resume Sync`,
          icon: isEnabled ? "pause" : "play",
          action: onToggle,
        },
        {
          title: t`Turn Off`,
          icon: "close",
          action: onDeactivate,
        },
      ].filter(isNotNull),
    [isEnabled, onToggle, onDeactivate],
  );

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" size="lg">
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {menuItems.map((item) => (
          <Menu.Item
            key={item.title}
            leftSection={<Icon name={item.icon as any} />}
            onClick={item.action}
            c={item.icon === "close" ? "danger" : undefined}
          >
            {item.title}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};

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
  | "remote-sync-configured"
>;

export const GitSyncSettings = (): JSX.Element => {
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const [updateGitSyncSettings] = useUpdateGitSyncSettingsMutation();
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);

  const { updateSettings } = useAdminSetting("remote-sync-url");

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
      return updateGitSyncSettings({
        ...values,
        "remote-sync-configured": true,
      }).unwrap();
    },
    [updateGitSyncSettings],
  );

  const isGitSyncConfigured = useSetting("remote-sync-configured");
  const isGitSyncEnabled = useSetting("remote-sync-enabled");

  const handleDeactivate = useCallback(async () => {
    await updateSettings({
      "remote-sync-enabled": null,
      "remote-sync-url": null,
      "remote-sync-token": null,
      "remote-sync-type": null,
      "remote-sync-branch": null,
      "remote-sync-configured": false,
    } as Partial<EnterpriseSettings>);
    setIsDeactivateModalOpen(false);
  }, [updateSettings]);

  const handlePauseResume = useCallback(async () => {
    await updateSettings({
      "remote-sync-enabled": !isGitSyncEnabled,
    } as Partial<EnterpriseSettings>);
  }, [isGitSyncEnabled, updateSettings]);

  const syncMode = settingValues?.[TYPE_KEY];

  return (
    <SettingsPageWrapper>
      <SettingsSection>
        <Box flex={1} maw="52rem">
          <Flex align="flex-end" gap="md" mb="xs">
            <Title order={2}>{t`Git Sync`}</Title>
            {isGitSyncConfigured && (
              <>
                <GitSyncStatusBadge isEnabled={!!isGitSyncEnabled} />
                <Box ml="auto">
                  <GitSyncMenu
                    isEnabled={!!isGitSyncEnabled}
                    onToggle={handlePauseResume}
                    onDeactivate={() => setIsDeactivateModalOpen(true)}
                  />
                </Box>
              </>
            )}
          </Flex>
          <Text c="text-dark" size="sm" mb="md" maw="40rem" lh="1.5rem">
            {t`Keep your dashboards, questions, and collections safely backed up in Git.`}
          </Text>

          <FormProvider
            initialValues={initialValues as GitSyncSettingsType}
            enableReinitialize
            validationSchema={GIT_SYNC_SCHEMA}
            validationContext={settingValues}
            onSubmit={onSubmit}
          >
            {({ dirty }) => (
              <Form disabled={!dirty}>
                <Stack gap="md">
                  {!isGitSyncConfigured && (
                    <Text c="text-medium" size="sm">
                      {jt`Need help setting this up? Check out our ${(
                        <ExternalLink key="link" href={docsUrl}>
                          {t`setup guide`}
                        </ExternalLink>
                      )}.`}
                    </Text>
                  )}

                  <FormTextInput
                    name={URL_KEY}
                    label={t`Repository URL`}
                    placeholder="https://github.com/yourcompany/metabase-library.git"
                    {...getEnvSettingProps(settingDetails?.[URL_KEY])}
                  />

                  <FormTextInput
                    name={TOKEN_KEY}
                    label={t`Access Token`}
                    description={t`Personal access token with write permissions`}
                    type="password"
                    {...getEnvSettingProps(settingDetails?.[TOKEN_KEY])}
                  />

                  <FormRadioGroup
                    name={TYPE_KEY}
                    label={t`How do you want to sync?`}
                    description={t`Import makes collections read-only and syncs from Git. Export lets you make changes here and push them to Git.`}
                  >
                    <Group mt="sm">
                      <Radio value="import" label={t`Import from Git`} />
                      <Radio value="export" label={t`Export to Git`} />
                    </Group>
                  </FormRadioGroup>

                  <FormTextInput
                    name={BRANCH_KEY}
                    label={t`Branch`}
                    description={t`Which branch to sync with`}
                    placeholder="main"
                    {...getEnvSettingProps(settingDetails?.[BRANCH_KEY])}
                  />

                  <Flex justify="end" align="center" gap="md">
                    <FormErrorMessage />
                    <FormSubmitButton
                      label={
                        isGitSyncConfigured
                          ? t`Save Changes`
                          : t`Set Up Git Sync`
                      }
                      variant="filled"
                      disabled={!dirty}
                    />
                  </Flex>
                </Stack>
              </Form>
            )}
          </FormProvider>
        </Box>
      </SettingsSection>

      {isGitSyncConfigured && syncMode != null ? (
        <SettingsSection
          title={t`Collections`}
          description={
            syncMode === "export"
              ? t`Choose which collections to sync with Git`
              : t`Collections synced from your Git repository`
          }
        >
          <CollectionSyncManager mode={syncMode} />
        </SettingsSection>
      ) : null}

      <ConfirmModal
        opened={isDeactivateModalOpen}
        title={t`Turn off Git Sync?`}
        message={t`This will remove all Git sync settings and stop backing up your content to Git.`}
        confirmButtonText={t`Turn Off`}
        onConfirm={handleDeactivate}
        onClose={() => setIsDeactivateModalOpen(false)}
      />
    </SettingsPageWrapper>
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
