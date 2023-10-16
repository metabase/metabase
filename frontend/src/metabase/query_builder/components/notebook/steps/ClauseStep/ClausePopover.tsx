import { useCallback, useState } from "react";
import type { PopoverBaseProps } from "metabase/ui";
import { Popover } from "metabase/ui";

interface ClausePopoverProps extends PopoverBaseProps {
  isInitiallyOpen?: boolean;
  renderItem: (open: () => void) => JSX.Element | string;
  renderPopover: (close: () => void) => JSX.Element | null;
}

const NO_TRANSITION = { duration: 0 };

export function ClausePopover({
  isInitiallyOpen = false,
  renderItem,
  renderPopover,
  ...props
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
      trapFocus
      transitionProps={NO_TRANSITION}
      {...props}
      opened={isOpen}
      onClose={handleClose}
    >
      <Popover.Target>{renderItem(handleOpen)}</Popover.Target>
      <Popover.Dropdown>{renderPopover(handleClose)}</Popover.Dropdown>
    </Popover>
  );
}
