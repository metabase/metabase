import type { MouseEventHandler } from "react";

import { Icon, Menu } from "metabase/ui";
import type { IconName } from "metabase-types/api";
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
      leftSection={<Icon name={iconName} />}
      disabled={disabled}
      onClick={onClick}
    >
      {title}
    </Menu.Item>
  );
};
