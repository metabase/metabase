import { Button, Flex, Icon, type IconName } from "metabase/ui";

export type Shortcut = {
  name: string;
  icon: IconName;
  action: () => void;
};

const DEFAULT_SHORTCUTS: Shortcut[] = [];

export function Shortcuts({
  shortcuts = DEFAULT_SHORTCUTS,
  className,
}: {
  shortcuts?: Shortcut[];
  className?: string;
}) {
  return (
    <Flex gap="sm" className={className} wrap="wrap">
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
