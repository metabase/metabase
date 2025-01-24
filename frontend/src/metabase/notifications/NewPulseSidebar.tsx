import cx from "classnames";
import { t } from "ttag";

import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Flex, Icon, Paper, Stack, Text, Title } from "metabase/ui";

interface NewPulseSidebarProps {
  emailConfigured: boolean;
  slackConfigured: boolean;
  onNewEmailPulse: () => void;
  onNewSlackPulse: () => void;
  onCancel: () => void;
}

const ChannelCard = ({
  onClick,
  title,
  channel,
}: {
  onClick?: () => void;
  title: string;
  channel: "email" | "slack";
}) => {
  const iconName = channel === "email" ? "mail" : "slack_colorized";

  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      shadow="none"
      onClick={onClick}
      className={cx(CS.cursorPointer, CS.bgLightHover, CS.textBrandHover)}
    >
      <Flex align="center" gap="sm">
        <Icon name={iconName} c="brand" />
        <Text weight={700} c="inherit">
          {title}
        </Text>
      </Flex>
    </Paper>
  );
};

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
      <Stack mx="xl" spacing="sm">
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
          <Link to="/admin/settings/notifications/slack">
            <ChannelCard title={t`Configure Slack`} channel="slack" />
          </Link>
        )}
      </Stack>
    </Sidebar>
  );
}
