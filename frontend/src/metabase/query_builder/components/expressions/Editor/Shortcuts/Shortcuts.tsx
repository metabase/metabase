import cx from "classnames";

import { Button, Flex, Icon, type IconName } from "metabase/ui";

import S from "./Shortcuts.module.css";

export type Shortcut = {
  name: string;
  icon: IconName;
  action: () => void;
};

const DEFAULT_SHORTCUTS: Shortcut[] = [];

export function Shortcuts({
  shortcuts = DEFAULT_SHORTCUTS,
  hide = false,
}: {
  shortcuts?: Shortcut[];
  hide?: boolean;
}) {
  return (
    <Flex
      gap="sm"
      className={cx(S.shortcuts, {
        [S.hidden]: hide,
      })}
    >
      {shortcuts.map((shortcut, index) => (
        <Button
          key={index}
          variant="light"
          radius="5rem"
          size="xs"
          onClick={shortcut.action}
          leftSection={<Icon name={shortcut.icon} />}
          tabIndex={hide ? -1 : undefined}
        >
          {shortcut.name}
        </Button>
      ))}
    </Flex>
  );
}
