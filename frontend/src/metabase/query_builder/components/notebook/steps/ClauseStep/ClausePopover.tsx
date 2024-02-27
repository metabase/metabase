import { useCallback, useState } from "react";

import type { PopoverBaseProps } from "metabase/ui";
import { Popover } from "metabase/ui";

const POPOVER_PROPS: PopoverBaseProps = {
  position: "bottom-start",
  offset: { mainAxis: 4 },
};

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
    <Popover trapFocus {...POPOVER_PROPS} opened={isOpen} onClose={handleClose}>
      <Popover.Target>{renderItem(handleOpen)}</Popover.Target>
      <Popover.Dropdown>{renderPopover(handleClose)}</Popover.Dropdown>
    </Popover>
  );
}
