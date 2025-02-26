import type { MouseEventHandler } from "react";

import { Center, Icon, type IconName, Menu } from "metabase/ui";

type CommonNotificationsMenuItemProps = {
  iconName: IconName;
  title: string;
  disabled?: boolean;
  onClick: MouseEventHandler;
};

export const CommonNotificationsMenuItem = ({
  iconName,
  title,
  disabled,
  onClick,
}: CommonNotificationsMenuItemProps) => {
  return (
    <Menu.Item
      data-testid="question-alert-menu-item"
      leftSection={
        <Center mr="xs">
          <Icon name={iconName} />
        </Center>
      }
      disabled={disabled}
      onClick={onClick}
    >
      {title}
    </Menu.Item>
  );
};
