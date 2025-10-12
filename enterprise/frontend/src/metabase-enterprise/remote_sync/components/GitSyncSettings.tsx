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
  FormSwitch,
  FormTextInput,
} from "metabase/forms";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import {
  Badge,
  Box,
  Button,
  Flex,
  Radio,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import {
  useGetChangedEntitiesQuery,
  useImportFromBranchMutation,
  useUpdateRemoteSyncSettingsMutation,
} from "metabase-enterprise/api/remote-sync";
import type {
  EnterpriseSettings,
  RemoteSyncSettingsSet,
  SettingDefinition,
} from "metabase-types/api";

import { GIT_SYNC_SCHEMA } from "../constants";

const URL_KEY = "remote-sync-url";
const TOKEN_KEY = "remote-sync-token";
const TYPE_KEY = "remote-sync-type";
const BRANCH_KEY = "remote-sync-branch";

export const GitSyncSettings = (): JSX.Element => {
  const dispatch = useDispatch();
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const [updateRemoteSyncSettings] = useUpdateRemoteSyncSettingsMutation();
  const { data: dirtyData } = useGetChangedEntitiesQuery(undefined, {
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
  });
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [importFromBranch, { isLoading: isImporting }] =
    useImportFromBranchMutation();

  const { updateSettings } = useAdminSetting("remote-sync-url");

  const handleSubmit = useCallback(
    (values: RemoteSyncSettingsSet) =>
      updateRemoteSyncSettings(values).unwrap(),
    [updateRemoteSyncSettings],
  );

  const initialValues = useMemo(() => {
    const values = GIT_SYNC_SCHEMA.cast(settingValues, { stripUnknown: true });
    const tokenValue =
      settingDetails?.[TOKEN_KEY]?.value ?? settingValues?.[TOKEN_KEY];
    return {
      ...values,
      [TOKEN_KEY]: tokenValue,
    };
  }, [settingValues, settingDetails]);

  // eslint-disable-next-line no-unconditional-metabase-links-render -- This links only shows for admins.
  const { url: docsUrl } = useDocsUrl(
    "installation-and-operation/remote-sync",
    {
      anchor: "remote-sync",
    },
  );

  const isGitSyncEnabled = useSetting("remote-sync-enabled");
  const isDirty = !!dirtyData?.dirty?.length;

  const handleDeactivate = useCallback(async () => {
    await updateSettings({
      "remote-sync-enabled": null,
      "remote-sync-url": null,
      "remote-sync-token": null,
      "remote-sync-type": null,
      "remote-sync-auto-import": null,
      "remote-sync-branch": null,
    } as Partial<EnterpriseSettings>);
    setIsDeactivateModalOpen(false);
  }, [updateSettings]);

  const handlePullChanges = useCallback(async () => {
    const currentBranch = settingValues?.[BRANCH_KEY] || "main";
    try {
      await importFromBranch({ branch: currentBranch, force: true }).unwrap();
    } catch (error) {
      dispatch(
        addUndo({
          message: t`Failed to pull changes`,
          toaster: true,
          undo: false,
        }),
      );
    }
  }, [importFromBranch, settingValues, dispatch]);

  return (
    <SettingsPageWrapper>
      <SettingsSection>
        <Box flex={1} maw="52rem">
          <Flex align="flex-end" gap="sm" mb="xs">
            <Title order={2}>{t`Git Sync`}</Title>
            {isGitSyncEnabled && (
              <Badge
                style={{ textTransform: "none" }}
                py={10}
                px="sm"
              >{t`Enabled`}</Badge>
            )}
          </Flex>
          <Text c="text-dark" size="sm" mb="md" maw="40rem" lh="1.5rem">
            {t`Keep your dashboards, questions, and collections safely backed up in Git.`}
          </Text>

          <FormProvider
            initialValues={initialValues as RemoteSyncSettingsSet}
            enableReinitialize
            validationSchema={GIT_SYNC_SCHEMA}
            validationContext={settingValues}
            onSubmit={handleSubmit}
          >
            {({ dirty, values }) => (
              <Form disabled={!dirty}>
                <Stack gap="md">
                  {!isGitSyncEnabled && (
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

                  <FormRadioGroup name={TYPE_KEY} label={t`Remote Sync Mode`}>
                    <Stack mt="sm">
                      <Radio
                        value="development"
                        label={t`Development`}
                        description={t`In development mode, you can make changes to synced collections and pull and push from any git branch`}
                      />
                      <Tooltip
                        disabled={!isDirty}
                        label={t`You can't switch to production as you have unpublished changes.`}
                        position="bottom-start"
                      >
                        <Box>
                          <Radio
                            description={t`In production mode, synced collections are read-only, and automatically sync with the specified branch`}
                            disabled={isDirty}
                            label={t`Production`}
                            value="production"
                          />
                        </Box>
                      </Tooltip>
                    </Stack>
                  </FormRadioGroup>

                  {values?.[TYPE_KEY] === "production" && (
                    <Stack ml="1.875rem">
                      <Flex align="end" gap="md">
                        <Box style={{ flex: 1 }}>
                          <FormTextInput
                            name={BRANCH_KEY}
                            label={t`Sync branch`}
                            placeholder="main"
                            {...getEnvSettingProps(
                              settingDetails?.[BRANCH_KEY],
                            )}
                          />
                        </Box>
                        {isGitSyncEnabled && (
                          <Tooltip
                            label={t`Save settings before pulling changes`}
                            disabled={!dirty}
                          >
                            <Button
                              variant="outline"
                              onClick={handlePullChanges}
                              disabled={isImporting || dirty}
                              loading={isImporting}
                            >{t`Pull changes`}</Button>
                          </Tooltip>
                        )}
                      </Flex>
                      <FormSwitch
                        size="sm"
                        name="remote-sync-auto-import"
                        label={t`Auto-sync with git`}
                      />
                    </Stack>
                  )}

                  <Flex justify="end" align="center" gap="md">
                    <FormErrorMessage />
                    <FormSubmitButton
                      label={
                        isGitSyncEnabled ? t`Save changes` : t`Set up Git Sync`
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
