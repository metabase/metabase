import { c, t } from "ttag";

import { useGetSlackAppInfoQuery } from "metabase/api";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useSetting } from "metabase/common/hooks";
import { Box, Stack, Text } from "metabase/ui";

import { AdminSettingInput } from "../components/widgets/AdminSettingInput";

import { SetupSection } from "./SlackSetupSection";

export const SlackConfiguration = () => {
  const isValid = useSetting("slack-token-valid?") ?? false;
  const bugReportingEnabled = useSetting("bug-reporting-enabled") ?? false;
  const { data: appInfo } = useGetSlackAppInfoQuery();

  const iconUrl = "/app/assets/img/metabot-slack-icon.png";
  const basicInfoUrl = appInfo?.app_id
    ? `https://api.slack.com/apps/${appInfo.app_id}/general#edit`
    : `https://api.slack.com/apps`;

  const imgDownloadLink = (
    <ExternalLink key="download" href={iconUrl} download>
      {t`Download icon`}
    </ExternalLink>
  );

  const iconSettingsLink = (
    <ExternalLink key="settings" href={basicInfoUrl}>
      {t`Basic Information`}
    </ExternalLink>
  );

  return (
    <SetupSection title={t`2. Configure your Slack App`} isDisabled={!isValid}>
      <Stack gap="lg">
        <Stack gap="sm">
          <Box>
            <Text fw="bold">{t`Slack app icon`}</Text>
            <Text c="text-secondary" lh="xl">
              {c(
                "{0} is a link that says 'Download icon'. {1} is a link that says 'Basic Information'.",
              )
                .jt`${imgDownloadLink} and upload it in your Slack app's ${iconSettingsLink} settings.`}
            </Text>
          </Box>
          <Box
            component="img"
            src={iconUrl}
            alt="Metabot icon"
            width={64}
            height={64}
            bdrs="sm"
          />
        </Stack>

        <AdminSettingInput
          name="slack-bug-report-channel"
          title={t`Slack bug report channel`}
          description={t`This channel will receive bug reports submitted by users.`}
          inputType="text"
          hidden={!bugReportingEnabled}
          placeholder="metabase-bugs"
        />
      </Stack>
    </SetupSection>
  );
};
