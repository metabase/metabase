import type { MouseEventHandler } from "react";

import { Center, Icon, type IconName, Menu, Text } from "metabase/ui";

type CommonNotificationsMenuItemProps = {
  iconName: IconName;
  title: string;
  onClick: MouseEventHandler;
};

export const CommonNotificationsMenuItem = ({
  iconName,
  onClick,
  title,
}: CommonNotificationsMenuItemProps) => {
  return (
    <Menu.Item
      data-testid="question-alert-menu-item"
      icon={
        <Center mr="xs">
          <Icon name={iconName} />
        </Center>
      }
      onClick={onClick}
    >
      <Text fz="md" color="inherit">
        {title}
      </Text>
    </Menu.Item>
  );
};
