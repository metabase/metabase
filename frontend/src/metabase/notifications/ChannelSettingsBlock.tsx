import type { JSX, ReactNode } from "react";

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
    <Stack spacing="0.75rem" w="100%">
      <Group position="apart" align="center">
        <Group spacing="xs" align="center">
          <Icon name={iconName} />
          <Text>{title}</Text>
        </Group>

        <Button
          leftIcon={<Icon name="close" />}
          color="text-dark"
          variant="subtle"
          compact
          onClick={onRemoveChannel}
        />
      </Group>

      {children}
    </Stack>
  );
};
