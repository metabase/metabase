import cx from "classnames";

import { Button, Flex, Icon } from "metabase/ui";
import type { Shortcut } from "metabase-lib/v1/expressions/complete";

import S from "./Shortcuts.module.css";

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
        >
          {shortcut.name}
        </Button>
      ))}
    </Flex>
  );
}
