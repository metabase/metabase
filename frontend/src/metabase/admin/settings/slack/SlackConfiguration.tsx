import { useEffect, useState } from "react";
import { c, t } from "ttag";

import {
  useGetSlackAppInfoQuery,
  useUpdateSlackSettingsMutation,
} from "metabase/api";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useSetting, useToast } from "metabase/common/hooks";
import { Box, Stack, Text, TextInput } from "metabase/ui";

import { SettingHeader } from "../components/SettingHeader";

import { SetupSection } from "./SlackSetupSection";

const getSlackError = (err: unknown): string =>
  (err as { data?: { errors?: { "slack-bug-report-channel"?: string } } })?.data
    ?.errors?.["slack-bug-report-channel"] ?? t`Failed to update channel`;

const SlackBugReportChannelInput = () => {
  const initialValue = useSetting("slack-bug-report-channel");
  const [updateSlackSettings] = useUpdateSlackSettingsMutation();
  const [sendToast] = useToast();
  const [localValue, setLocalValue] = useState(initialValue ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalValue(initialValue ?? "");
  }, [initialValue]);

  const handleBlur = async () => {
    const trimmedValue = localValue.replace(/^#+/, "");
    setLocalValue(trimmedValue);

    const value = trimmedValue === "" ? null : trimmedValue.toLowerCase();
    if (value === initialValue) {
      return;
    }

    setError(null);
    try {
      await updateSlackSettings({ "slack-bug-report-channel": value }).unwrap();
      sendToast({
        message: t`Slack bug report channel updated`,
        toastColor: "success",
      });
    } catch (err) {
      setError(getSlackError(err));
    }
  };

  return (
    <Box data-testid="slack-bug-report-channel-setting">
      <SettingHeader
        id="slack-bug-report-channel"
        title={t`Slack bug report channel`}
        description={t`This channel will receive bug reports submitted by users.`}
      />
      <TextInput
        id="slack-bug-report-channel"
        value={localValue}
        placeholder="metabase-bugs"
        onChange={(e) => {
          setLocalValue(e.target.value);
          setError(null);
        }}
        onBlur={handleBlur}
        leftSection={<Text c="text-secondary">#</Text>}
        error={error}
      />
    </Box>
  );
};

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

        {bugReportingEnabled && <SlackBugReportChannelInput />}
      </Stack>
    </SetupSection>
  );
};
