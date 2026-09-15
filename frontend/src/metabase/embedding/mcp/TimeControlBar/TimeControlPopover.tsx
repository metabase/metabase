import { useState } from "react";

import { Button, Popover } from "metabase/ui";

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
          px="lg"
          variant="subtle"
          color="neutral"
          onClick={() => setIsOpen(!isOpen)}
        >
          {label}
        </Button>
      </Popover.Target>

      <Popover.Dropdown>{children(() => setIsOpen(false))}</Popover.Dropdown>
    </Popover>
  );
}
