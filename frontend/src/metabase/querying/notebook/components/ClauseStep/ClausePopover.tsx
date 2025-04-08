import { useDndContext } from "@dnd-kit/core";
import { useCallback, useLayoutEffect, useState } from "react";

import { Popover } from "metabase/ui";
import { PreventPopoverExitProvider } from "metabase/ui/components/utils/PreventPopoverExit";

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
  const { active } = useDndContext();

  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleChange = useCallback(() => {
    setIsOpen((value) => !value);
  }, []);

  useLayoutEffect(() => {
    if (active) {
      setIsOpen(false);
    }
  }, [active]);

  return (
    <PreventPopoverExitProvider>
      <Popover
        opened={isOpen}
        position="bottom-start"
        offset={{ mainAxis: 4 }}
        trapFocus
        onChange={handleChange}
      >
        <Popover.Target>{renderItem(handleOpen)}</Popover.Target>
        <Popover.Dropdown data-testid="clause-popover">
          {renderPopover(handleClose)}
        </Popover.Dropdown>
      </Popover>
    </PreventPopoverExitProvider>
  );
}
