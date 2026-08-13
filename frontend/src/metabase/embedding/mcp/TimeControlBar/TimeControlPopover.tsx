import { useState } from "react";

import { Button, Popover } from "metabase/ui";

import S from "./TimeControlPopover.module.css";

export function TimeControlPopover({
  label,
  children,
}: {
  label: string;
  children: (closePopover: () => void) => React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover opened={isOpen} onChange={setIsOpen}>
      <Popover.Target>
        <Button
          size="xs"
          h={32}
          fw="normal"
          px="md"
          variant="subtle"
          color="text-primary"
          lh="1"
          classNames={{ root: S.popoverTargetButton }}
          onClick={() => setIsOpen(!isOpen)}
        >
          {label}
        </Button>
      </Popover.Target>

      <Popover.Dropdown>{children(() => setIsOpen(false))}</Popover.Dropdown>
    </Popover>
  );
}
