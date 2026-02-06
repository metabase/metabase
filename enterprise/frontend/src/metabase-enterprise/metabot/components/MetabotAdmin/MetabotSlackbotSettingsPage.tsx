import { useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useUpdateSettingsMutation } from "metabase/api";
import { useAdminSetting } from "metabase/api/utils";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import {
  ButtonLink,
  ExternalLink,
} from "metabase/common/components/ExternalLink";
import {
  useDocsUrl,
  useHasTokenFeature,
  useSetting,
} from "metabase/common/hooks";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Flex, Stack, Text } from "metabase/ui";
import { useGetSlackbotManifestQuery } from "metabase-enterprise/api";

import { MetabotNavPane } from "./MetabotNavPane";

interface SlackbotFormValues {
  botToken: string;
  signingSecret: string;
  clientId: string;
  clientSecret: string;
}

export function MetabotSlackbotAdminPage() {
  const encryptionEnabled = useSetting("encryption-enabled");
  const { url: encryptionDocsUrl, showMetabaseLinks } = useDocsUrl(
    "operations-guide/encrypting-database-details-at-rest",
  );
  const ssoSlackEnabled = useHasTokenFeature("sso_slack");

  const [updateSettings] = useUpdateSettingsMutation();
  const { value: botToken } = useAdminSetting("metabot-slack-bot-token");
  const { value: signingSecret } = useAdminSetting(
    "metabot-slack-signing-secret",
  );
  const { value: clientId } = useAdminSetting("slack-connect-client-id");
  const { value: clientSecret } = useAdminSetting(
    "slack-connect-client-secret",
  );

  const { data: manifest } = useGetSlackbotManifestQuery();

  const link = useMemo(() => {
    const encodedManifest = encodeURIComponent(JSON.stringify(manifest));
    return manifest
      ? `/apps?new_app=1&manifest_json=${encodedManifest}`
      : "/apps";
  }, [manifest]);

  const handleSubmit = async (values: SlackbotFormValues) => {
    await updateSettings({
      "metabot-slack-bot-token": values.botToken,
      "metabot-slack-signing-secret": values.signingSecret,
      "slack-connect-client-id": values.clientId,
      "slack-connect-client-secret": values.clientSecret,
    }).unwrap();
  };

  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <ErrorBoundary>
        <SettingsSection>
          <Stack gap="md">
            <Text>
              {t`0. Encryption enabled:`} {String(encryptionEnabled)}{" "}
              {showMetabaseLinks && (
                <ExternalLink href={encryptionDocsUrl}>
                  {t`Learn how to enable encryption`}
                </ExternalLink>
              )}
            </Text>

            <Text>
              {t`1. SSO Slack enabled: ${String(ssoSlackEnabled)} (You might have to hack this until cloud updates our dev token to have it)`}
            </Text>

            <Stack gap="sm">
              <Flex gap="sm">
                <Text>{t`2. Create Slack app`}</Text>
                <ButtonLink href={`https://api.slack.com${link}`}>
                  {t`Create Slack App`}
                </ButtonLink>
                <Text>{t`and install to your workspace`}</Text>
              </Flex>
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

            <Stack gap="sm">
              <Text>
                {t`4. Give us Slack info`}
                <br />
                {t`⚠️ VIEWING SAVED VALUES IS BORKED AT THE MOMENT - they should set correctly though`}
              </Text>

              <FormProvider<SlackbotFormValues>
                initialValues={{
                  botToken: botToken ?? "",
                  signingSecret: signingSecret ?? "",
                  clientId: clientId ?? "",
                  clientSecret: clientSecret ?? "",
                }}
                onSubmit={handleSubmit}
                enableReinitialize
              >
                <Form>
                  <Stack gap="sm">
                    <FormTextInput
                      name="clientId"
                      label={t`Client ID`}
                      description={t`Found in your Slack app settings under Basic Information.`}
                      placeholder="123456789012.123456789012"
                    />
                    <FormTextInput
                      name="clientSecret"
                      label={t`Client Secret`}
                      description={t`Found in your Slack app settings under Basic Information.`}
                      placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                    <FormTextInput
                      name="signingSecret"
                      label={t`Signing Secret`}
                      description={t`Found in your Slack app settings under Basic Information.`}
                      placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                    <FormTextInput
                      name="botToken"
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
          </Stack>
        </SettingsSection>
      </ErrorBoundary>
    </AdminSettingsLayout>
  );
}
