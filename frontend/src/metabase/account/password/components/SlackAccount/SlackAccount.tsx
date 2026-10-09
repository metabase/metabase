import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Button, Group, Stack } from "metabase/ui";

type SlackAccountProps = {
  isActive: boolean;
  isDisconnecting: boolean;
  onDisconnect: () => void;
};

export function SlackAccount({
  isActive,
  isDisconnecting,
  onDisconnect,
}: SlackAccountProps) {
  const applicationName = useSelector(getApplicationName);
  const { modalContent, show } = useConfirmation();

  const handleDisconnect = () =>
    show({
      title: t`Disconnect your Slack account?`,
      message: t`Metabot won't be able to answer you in Slack until you connect again.`,
      confirmButtonText: t`Disconnect`,
      onConfirm: onDisconnect,
    });

  return (
    <>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap="xxs">
          <Box fw="bold">{t`Slack`}</Box>
          <Box c="text-secondary">
            {isActive
              ? t`Your Slack account is connected to ${applicationName}.`
              : t`Your Slack connection is no longer active.`}
          </Box>
        </Stack>
        <Button loading={isDisconnecting} onClick={handleDisconnect}>
          {t`Disconnect`}
        </Button>
      </Group>
      {modalContent}
    </>
  );
}
