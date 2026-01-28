import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { useSelector } from "metabase/lib/redux";
import { ChannelCard } from "metabase/notifications/pulse/components/ChannelCard";
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
      <Box mx="xl" my="lg">
        <Title order={4} mb="sm">{t`Set up a dashboard subscription`}</Title>
        <Text lh="md">{t`Schedule dashboard results to be sent to you and your team. People don't need a ${applicationName} account to subscribe.`}</Text>
      </Box>
      <Stack mx="xl" gap="sm">
        {emailConfigured ? (
          <ChannelCard
            title={t`Email it`}
            channel="email"
            onClick={onNewEmailPulse}
          />
        ) : (
          <Link to="/admin/settings/email">
            <ChannelCard title={t`Set up email`} channel="email" />
          </Link>
        )}

        {slackConfigured ? (
          <ChannelCard
            title={t`Send it to Slack`}
            channel="slack"
            onClick={onNewSlackPulse}
          />
        ) : (
          <Link to="/admin/settings/notifications">
            <ChannelCard title={t`Configure Slack`} channel="slack" />
          </Link>
        )}
      </Stack>
    </Sidebar>
  );
}
