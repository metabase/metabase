import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useSetting } from "metabase/common/hooks";
import { Box, Stack, Text } from "metabase/ui";

import { AdminSettingInput } from "../components/widgets/AdminSettingInput";

import { SetupSection } from "./SlackSetupSection";

export const SlackConfiguration = () => {
  const isValid = useSetting("slack-token-valid?") ?? false;
  const bugReportingEnabled = useSetting("bug-reporting-enabled") ?? false;

  return (
    <SetupSection title={t`2. Configure your Slack App`} isDisabled={!isValid}>
      <Stack gap="lg">
        <Stack gap="sm">
          <Text>
            <ExternalLink
              href="/app/assets/img/metabot-slack-icon.png"
              download
            >
              {t`Download icon`}
            </ExternalLink>
            {t` and upload it in your Slack app's Basic Information settings.`}
          </Text>
          <Box
            component="img"
            src="/app/assets/img/metabot-slack-icon.png"
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
