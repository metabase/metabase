import type { MouseEventHandler } from "react";

import { Center, Icon, type IconName, Menu, Title } from "metabase/ui";

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
      icon={
        <Center mr="xs">
          <Icon name={iconName} />
        </Center>
      }
      onClick={onClick}
    >
      <Title order={4} color="inherit">
        {title}
      </Title>
    </Menu.Item>
  );
};
