import { useDndContext } from "@dnd-kit/core";
import { useCallback, useLayoutEffect, useState } from "react";

import { Box, Popover } from "metabase/ui";
import { PreventPopoverExitProvider } from "metabase/ui/components/utils/PreventPopoverExit";

import S from "./ClausePopover.module.css";

interface ClausePopoverProps {
  isInitiallyOpen?: boolean;
  disabled?: boolean;
  renderItem: (open: () => void, hasPopover?: boolean) => JSX.Element | string;
  renderPopover: (close: () => void) => JSX.Element | null;
}

const noop = () => {};

export function ClausePopover({
  isInitiallyOpen = false,
  disabled = false,
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

  const content = renderPopover(handleClose);
  const hasPopover = content !== null && !disabled;

  return (
    <PreventPopoverExitProvider>
      <Popover
        opened={isOpen}
        position="bottom-start"
        offset={{ mainAxis: 4 }}
        trapFocus
        onChange={handleChange}
        classNames={{ dropdown: S.dropdown }}
        disabled={!hasPopover}
      >
        <Popover.Target>
          {renderItem(disabled ? noop : handleOpen, hasPopover)}
        </Popover.Target>
        <Popover.Dropdown data-testid="clause-popover">
          <Box className={S.dropdownContent} data-testid="popover-content">
            {content}
          </Box>
        </Popover.Dropdown>
      </Popover>
    </PreventPopoverExitProvider>
  );
}
