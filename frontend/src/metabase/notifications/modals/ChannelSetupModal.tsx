import { Link } from "react-router";
import { t } from "ttag";

import { Button, Icon, type IconName, Modal, Stack, Text } from "metabase/ui";

const CHANNELS_CONFIG: {
  title: string;
  icon: IconName;
  link: string;
}[] = [
  {
    title: t`Set up SMTP`,
    icon: "mail",
    link: "/admin/settings/email",
  },
  {
    title: t`Set up Slack`,
    icon: "slack",
    link: "/admin/settings/notifications/slack",
  },
  {
    title: "Add a webhook",
    icon: "webhook",
    link: "/admin/settings/notifications",
  },
];

type ChannelSetupContentProps = {
  isAdmin: boolean;
  onClose: () => void;
};

export const ChannelSetupModal = ({
  isAdmin,
  onClose,
}: ChannelSetupContentProps) => {
  return (
    <Modal
      opened
      title={t`Alerts`}
      size="sm"
      onClose={onClose}
      data-testid="alerts-channel-setup-modal"
    >
      <Stack gap="0.5rem">
        <Text mb="1rem">
          {isAdmin
            ? t`To get notified when something happens, or to send this chart on a schedule, first set up SMTP, Slack, or a webhook.`
            : t`To get notified when something happens, or to send this chart on a schedule, ask your Admin to set up SMTP, Slack, or a webhook.`}
        </Text>

        {isAdmin &&
          CHANNELS_CONFIG.map(({ title, icon, link }) => (
            <Button
              key={title}
              leftSection={<Icon name={icon} />}
              component={Link}
              to={link}
              target="_blank"
            >
              {title}
            </Button>
          ))}
      </Stack>
    </Modal>
  );
};
