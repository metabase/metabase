import { Link } from "react-router";
import { t } from "ttag";

import { Button, Icon, type IconName, Modal, Stack, Text } from "metabase/ui";

const CHANNELS_CONFIG: {
  title: string;
  icon: IconName;
  link: string;
  testId?: string;
}[] = [
  {
    get title() {
      return t`Set up email`;
    },
    icon: "mail",
    link: "/admin/settings/email",
  },
  {
    get title() {
      return t`Set up Slack`;
    },
    icon: "slack",
    link: "/admin/settings/notifications",
  },
  {
    get title() {
      return t`Add a webhook`;
    },
    icon: "webhook",
    link: "/admin/settings/notifications",
    testId: "alerts-channel-create-webhook",
  },
];

type ChannelSetupContentProps = {
  userCanAccessSettings: boolean;
  onClose: () => void;
};

export const ChannelSetupModal = ({
  userCanAccessSettings,
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
          {userCanAccessSettings
            ? t`To get notified when something happens, or to send this chart on a schedule, first set up email, Slack, or a webhook.`
            : t`To get notified when something happens, or to send this chart on a schedule, ask your admin to set up email, Slack, or a webhook.`}
        </Text>

        {userCanAccessSettings &&
          CHANNELS_CONFIG.map(({ title, icon, link, testId }) => (
            <Button
              data-testid={testId}
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
