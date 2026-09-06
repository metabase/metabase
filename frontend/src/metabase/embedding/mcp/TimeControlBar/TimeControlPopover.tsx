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
          fw="normal"
          px="lg"
          variant="subtle"
          color="text-primary"
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
