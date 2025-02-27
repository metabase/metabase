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
}: {
  shortcuts?: Shortcut[];
}) {
  return (
    <Flex gap="sm" className={S.shortcuts}>
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
