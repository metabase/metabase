import type { MouseEvent, ReactNode } from "react";

import { Icon, type IconName, Menu, Text } from "metabase/ui";

export type OverflowMenuItem = {
  enabled?: boolean;
  title?: string | ReactNode;
  icon?: IconName;
  action?: ((e: MouseEvent) => void) | (() => void);
  link?: string;
  event?: string;
  testId?: string;
  component?: ReactNode;
};
export const OverflowMenu = ({
  items,
  target,
}: {
  items: OverflowMenuItem[];
  target: ReactNode;
}) => (
  <Menu>
    <Menu.Target>{target}</Menu.Target>
    <Menu.Dropdown>
      {items.map((item, index) => {
        if (item.enabled === false) {
          return null;
        }

        if (item.component) {
          return item.component;
        }

        return (
          <Menu.Item
            key={index}
            onClick={item.action}
            data-metabase-event={item.event}
            data-testid={item.testId}
            icon={item.icon && <Icon name={item.icon} />}
          >
            <Text fw="bold">{item.title}</Text>
          </Menu.Item>
        );
      })}
    </Menu.Dropdown>
  </Menu>
);
