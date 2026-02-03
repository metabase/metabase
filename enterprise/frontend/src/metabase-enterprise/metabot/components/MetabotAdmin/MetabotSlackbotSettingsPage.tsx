import { useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useAdminSetting } from "metabase/api/utils";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import {
  ButtonLink,
  ExternalLink,
} from "metabase/common/components/ExternalLink";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import { Flex, Stack, Text, TextInput } from "metabase/ui";
import { useGetSlackbotManifestQuery } from "metabase-enterprise/api";

import { MetabotNavPane } from "./MetabotNavPane";

export function MetabotSlackbotAdminPage() {
  const encryptionEnabled = useSetting("encryption-enabled");
  const { url: encryptionDocsUrl, showMetabaseLinks } = useDocsUrl(
    "operations-guide/encrypting-database-details-at-rest",
  );

  const { value: botToken, updateSetting: updateBotToken } = useAdminSetting(
    "metabot-slack-bot-token",
  );
  const { value: signingSecret, updateSetting: updateSigningSecret } =
    useAdminSetting("metabot-slack-signing-secret");

  const { data: manifest } = useGetSlackbotManifestQuery();

  const link = useMemo(() => {
    const encodedManifest = encodeURIComponent(JSON.stringify(manifest));
    return manifest
      ? `/apps?new_app=1&manifest_json=${encodedManifest}`
      : "/apps";
  }, [manifest]);

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

            <Stack gap="sm">
              <Flex gap="sm">
                <Text>{t`1. Create Slack app`}</Text>
                <ButtonLink href={`https://api.slack.com${link}`}>
                  {t`Create Slack App`}
                </ButtonLink>
                <Text>{t`and install to your workspace`}</Text>
              </Flex>
            </Stack>

            <Stack gap="sm">
              <Flex gap="sm">
                <Text>{t`2. Give us Slack info`}</Text>
              </Flex>
              <TextInput
                label={t`Bot User OAuth Token`}
                description={t`Found in your Slack app settings under OAuth & Permissions. Starts with "xoxb-".`}
                placeholder="xoxb-..."
                value={botToken || ""}
                onChange={(e) =>
                  updateBotToken({
                    key: "metabot-slack-bot-token",
                    value: e.target.value,
                  })
                }
              />
              <TextInput
                label={t`Signing Secret`}
                description={t`Found in your Slack app settings under Basic Information. Used to verify requests from Slack.`}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={signingSecret || ""}
                onChange={(e) =>
                  updateSigningSecret({
                    key: "metabot-slack-signing-secret",
                    value: e.target.value,
                  })
                }
              />
            </Stack>
          </Stack>
        </SettingsSection>
      </ErrorBoundary>
    </AdminSettingsLayout>
  );
}
