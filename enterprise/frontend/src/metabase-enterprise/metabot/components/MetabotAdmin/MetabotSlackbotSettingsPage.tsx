import { useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useAdminSettings } from "metabase/api/utils";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import {
  ButtonLink,
  ExternalLink,
} from "metabase/common/components/ExternalLink";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Box, Flex, Stack, Text } from "metabase/ui";
import { useGetSlackbotManifestQuery } from "metabase-enterprise/api";

import { MetabotNavPane } from "./MetabotNavPane";

export function MetabotSlackbotAdminPage() {
  const encryptionEnabled = useSetting("encryption-enabled");
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- admin only page
  const { url: encryptionDocsUrl } = useDocsUrl(
    "operations-guide/encrypting-database-details-at-rest",
  );

  const { data: manifest } = useGetSlackbotManifestQuery();
  const link = useMemo(() => {
    const encodedManifest = encodeURIComponent(JSON.stringify(manifest));
    return manifest
      ? `/apps?new_app=1&manifest_json=${encodedManifest}`
      : "/apps";
  }, [manifest]);

  const { values, updateSettings } = useAdminSettings([
    "metabot-slack-bot-token",
    "metabot-slack-signing-secret",
    "slack-connect-client-id",
    "slack-connect-client-secret",
  ] as const);

  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <ErrorBoundary>
        <SettingsSection>
          <Stack gap="lg">
            {!encryptionEnabled && (
              <Stack gap="sm">
                <Text fw="bold">{t`0. Enable encryption for your instance.`}</Text>
                <ExternalLink href={encryptionDocsUrl}>
                  {t`Learn how to enable encryption`}
                </ExternalLink>
              </Stack>
            )}

            <Stack gap="sm">
              <Text fw="bold">{t`1. Click the button below and create your Slack App`}</Text>
              <Text>{t`First, click the button below to create your Slack App. Once created, click "Install to workspace" to authorize it.`}</Text>
              <Box>
                <ButtonLink href={`https://api.slack.com${link}`}>
                  {t`Create Slack App`}
                </ButtonLink>
              </Box>
            </Stack>

            <Stack gap="sm">
              <Text>
                <Text fw="bold">{t`2. Provide your Slack application details`}</Text>
                {t`⚠️ VIEWING SAVED VALUES IS BORKED AT THE MOMENT - they should set correctly though`}
              </Text>

              <FormProvider
                initialValues={values}
                onSubmit={updateSettings}
                enableReinitialize
              >
                <Form>
                  <Stack gap="sm">
                    <FormTextInput
                      name="slack-connect-client-id"
                      label={t`Client ID`}
                      description={t`Found in your Slack app settings under Basic Information.`}
                      placeholder="123456789012.123456789012"
                    />
                    <FormTextInput
                      name="slack-connect-client-secret"
                      label={t`Client Secret`}
                      description={t`Found in your Slack app settings under Basic Information.`}
                      placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                    <FormTextInput
                      name="metabot-slack-signing-secret"
                      label={t`Signing Secret`}
                      description={t`Found in your Slack app settings under Basic Information.`}
                      placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                    <FormTextInput
                      name="metabot-slack-bot-token"
                      label={t`Bot User OAuth Token`}
                      description={t`Found in your Slack app settings under OAuth & Permissions.`}
                      placeholder="xoxb-..."
                    />
                    <Flex justify="flex-end" mt="md">
                      <FormSubmitButton label={t`Save`} variant="filled" />
                    </Flex>
                  </Stack>
                </Form>
              </FormProvider>
            </Stack>

            <Stack gap="sm">
              <Text>{t`3. Set your bot's app icon`}</Text>
              <Flex gap="sm" align="center">
                <img
                  src="/app/assets/img/metabot-slack-icon.png"
                  alt="Metabot icon"
                  width={64}
                  height={64}
                />
                <Text>
                  <ExternalLink
                    href="/app/assets/img/metabot-slack-icon.png"
                    download
                  >
                    {t`Download icon`}
                  </ExternalLink>
                  {t` and upload it in your Slack app's Basic Information settings.`}
                </Text>
              </Flex>
            </Stack>
          </Stack>
        </SettingsSection>
      </ErrorBoundary>
    </AdminSettingsLayout>
  );
}
