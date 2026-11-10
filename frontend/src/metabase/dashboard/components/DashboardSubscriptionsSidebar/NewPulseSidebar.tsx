import { t } from "ttag";

import { Sidebar } from "metabase/common/components/Sidebar";
import { ChannelCard } from "metabase/notifications/pulse/components/ChannelCard";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Stack, Text, Title } from "metabase/ui";

interface NewPulseSidebarProps {
  emailConfigured: boolean;
  slackConfigured: boolean;
  onNewEmailPulse: () => void;
  onNewSlackPulse: () => void;
  onCancel: () => void;
}

export function NewPulseSidebar({
  onCancel,
  emailConfigured,
  slackConfigured,
  onNewEmailPulse,
  onNewSlackPulse,
}: NewPulseSidebarProps) {
  const applicationName = useSelector(getApplicationName);

  return (
    <Sidebar onCancel={onCancel}>
      <Box mx="xxl" my="xl">
        <Title order={4} mb="sm">{t`Set up a dashboard subscription`}</Title>
        <Text lh="md">{t`Schedule dashboard results to be sent to you and your team. People don't need a ${applicationName} account to subscribe.`}</Text>
      </Box>
      <Stack mx="xxl" gap="sm">
        {emailConfigured ? (
          <ChannelCard
            title={t`Email it`}
            channel="email"
            onClick={onNewEmailPulse}
          />
        ) : (
          <ChannelCard
            title={t`Set up email`}
            channel="email"
            to="/admin/settings/email"
          />
        )}

        {slackConfigured ? (
          <ChannelCard
            title={t`Send it to Slack`}
            channel="slack"
            onClick={onNewSlackPulse}
          />
        ) : (
          <ChannelCard
            title={t`Configure Slack`}
            channel="slack"
            to="/admin/settings/slack"
          />
        )}
      </Stack>
    </Sidebar>
  );
}
