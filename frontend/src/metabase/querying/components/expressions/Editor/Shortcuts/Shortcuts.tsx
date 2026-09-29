import { Button, Flex, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";
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
  return null;
}
