import type { JSX, ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { Button, Group, Icon, type IconName, Stack, Text } from "metabase/ui";

type ChannelSettingsBlockProps = {
  title: string;
  iconName: IconName;
  children?: ReactNode;
  onRemoveChannel: () => void;
};

export const ChannelSettingsBlock = ({
  title,
  iconName,
  children,
  onRemoveChannel,
}: ChannelSettingsBlockProps): JSX.Element => {
  return (
    <Stack gap="0.75rem" w="100%" data-testid="channel-block">
      <Group justify="space-between" align="center">
        <Group gap="xs" align="center">
          <Icon name={iconName} />
          <Text className={CS.textShortLineHeight}>{title}</Text>
        </Group>

        <Button
          data-testid="remove-channel-button"
          leftSection={<Icon name="close" />}
          color="text-primary"
          variant="subtle"
          size="compact-md"
          onClick={onRemoveChannel}
        />
      </Group>

      {children}
    </Stack>
  );
};
