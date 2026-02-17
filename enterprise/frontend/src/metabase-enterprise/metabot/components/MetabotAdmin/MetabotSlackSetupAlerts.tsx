import { t } from "ttag";

import { CopyButton } from "metabase/common/components/CopyButton";
import {
  ButtonLink,
  ExternalLink,
} from "metabase/common/components/ExternalLink";
import { Markdown } from "metabase/common/components/Markdown";
import { Alert, Group, Icon, Stack } from "metabase/ui";

import S from "./MetabotSlackSetup.module.css";

interface MissingScopesAlertProps {
  manifest: Record<string, unknown> | undefined;
  appInfo?: { app_id: string | null; team_id: string | null };
}

export function MissingScopesAlert({
  manifest,
  appInfo,
}: MissingScopesAlertProps) {
  const slackUrl =
    appInfo?.app_id && appInfo?.team_id
      ? `https://app.slack.com/app-settings/${appInfo.team_id}/${appInfo.app_id}/app-manifest`
      : "https://api.slack.com/apps";

  return (
    <Alert color="brand" title={t`Your Slack app needs updated permissions`}>
      <Stack gap="md">
        <Markdown>
          {t`Your Slack app is missing OAuth scopes required for Metabot. **Copy the updated manifest** and paste it in your Slack app settings.`}
        </Markdown>
        <Group gap="md">
          <CopyButton
            value={JSON.stringify(manifest, null, 2)}
            target={
              <button type="button" className={S.copyButton}>
                <span>{t`Copy manifest`}</span>
                <Icon name="copy" size={16} ml="sm" />
              </button>
            }
          />
          <ButtonLink href={slackUrl}>
            <span>{t`Open Slack settings`}</span>
            <Icon name="external" size={16} ml="sm" />
          </ButtonLink>
        </Group>
      </Stack>
    </Alert>
  );
}

interface EncryptionRequiredAlertProps {
  docsUrl: string;
}

export function EncryptionRequiredAlert({
  docsUrl,
}: EncryptionRequiredAlertProps) {
  return (
    <Alert
      color="brand"
      title={t`You must enable encryption for your instance in order to use this feature`}
    >
      <ExternalLink
        href={docsUrl}
      >{t`Learn how to enable encryption`}</ExternalLink>
    </Alert>
  );
}
