import { useCallback, useState } from "react";

import { Popover } from "metabase/ui";

interface ClausePopoverProps {
  isInitiallyOpen?: boolean;
  renderItem: (open: () => void) => JSX.Element | string;
  renderPopover: (close: () => void) => JSX.Element | null;
}

export function ClausePopover({
  isInitiallyOpen = false,
  renderItem,
  renderPopover,
}: ClausePopoverProps) {
  const [isOpen, setIsOpen] = useState(isInitiallyOpen);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <Popover
      opened={isOpen}
      position="bottom-start"
      offset={{ mainAxis: 4 }}
      trapFocus
      onClose={handleClose}
    >
      <Popover.Target>{renderItem(handleOpen)}</Popover.Target>
      <Popover.Dropdown>{renderPopover(handleClose)}</Popover.Dropdown>
    </Popover>
  );
}
