import { useDndContext } from "@dnd-kit/core";
import { useCallback, useLayoutEffect, useState } from "react";

import { Box, Popover } from "metabase/ui";
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

  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  return (
    <PreventPopoverExitProvider>
      <Popover
        opened={isOpen}
        position="bottom-start"
        offset={{ mainAxis: 4 }}
        trapFocus
        onChange={handleChange}
        floatingStrategy="fixed"
        middlewares={{
          size: {
            padding: 10,
            apply(args) {
              // HACK: Safari has a bug where parent elements with overflow: auto
              // will clip elements that are positioned with fixed/absolute
              // whenever the parent element is overflowing (ie. has scrollbars).
              //
              // See https://bugs.webkit.org/show_bug.cgi?id=160953
              //
              // This causes popovers rendered by children of this popover to be
              // clipped.
              //
              // This workaround solves the issue by moving the overflow
              // onto a child element instead.
              setMaxHeight(args.availableHeight);
            },
          },
        }}
        styles={{
          dropdown: {
            overflow: "visible",
          },
        }}
      >
        <Popover.Target>{renderItem(handleOpen)}</Popover.Target>
        <Popover.Dropdown data-testid="clause-popover">
          <Box style={{ overflow: "auto", maxHeight }}>
            {renderPopover(handleClose)}
          </Box>
        </Popover.Dropdown>
      </Popover>
    </PreventPopoverExitProvider>
  );
}
