import type { MouseEvent } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";

type DocsButtonProps = {
  isOpen: boolean;
  onToggle: () => void;
};

/**
 * Version F: the info button next to Run or Done, in code mode. It opens and
 * closes the docs side panel.
 */
export function DocsButton({ isOpen, onToggle }: DocsButtonProps) {
  const label = isOpen
    ? t`Close list of expressions`
    : t`Open list of expressions`;
  return (
    <Tooltip label={label}>
      <ActionIcon
        variant="subtle"
        color="neutral"
        size="sm"
        aria-label={label}
        aria-pressed={isOpen}
        // The code keeps the focus, and the cursor stays where it was.
        onMouseDown={preventDefault}
        onClick={onToggle}
      >
        <Icon name="info" size={12} />
      </ActionIcon>
    </Tooltip>
  );
}

function preventDefault(event: MouseEvent) {
  event.preventDefault();
}
