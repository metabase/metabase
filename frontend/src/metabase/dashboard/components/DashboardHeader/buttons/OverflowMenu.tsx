import type { MouseEvent, ReactNode } from "react";
import { P, match } from "ts-pattern";

import { Icon, type IconName, Menu, Text } from "metabase/ui";

export type OverflowMenuItem =
  | {
      enabled?: boolean;
      title?: string | ReactNode;
      icon?: IconName;
      action?: ((e: MouseEvent) => void) | (() => void);
      link?: string;
      event?: string;
      testId?: string;
    }
  | {
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
      {items.map((item, index) =>
        match(item)
          .returnType<ReactNode | null>()
          .with({ enabled: P.when(enabled => enabled === false) }, () => null)
          .with({ component: P.not(P.nullish) }, item => item.component)
          .with({ title: P.not(P.nullish) }, item => (
            <Menu.Item
              key={index}
              onClick={item.action}
              data-testid={item.testId}
              icon={item.icon && <Icon name={item.icon} />}
            >
              <Text fw="bold">{item.title}</Text>
            </Menu.Item>
          ))
          .otherwise(() => null),
      )}
    </Menu.Dropdown>
  </Menu>
);
