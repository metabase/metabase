import type { MouseEventHandler } from "react";

import { Center, Icon, type IconName, Menu } from "metabase/ui";

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
      my="sm"
      leftSection={
        <Center mr="xs">
          <Icon name={iconName} />
        </Center>
      }
      onClick={onClick}
    >
      {title}
    </Menu.Item>
  );
};
