import { useDndContext } from "@dnd-kit/core";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";

import {
  Box,
  DEFAULT_POPOVER_MIDDLEWARES,
  type FloatingPosition,
  Popover,
  type PopoverProps,
} from "metabase/ui";
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
  const { position, middlewares, unlockPosition } =
    usePositionLockedWhileOpen();
  const { active } = useDndContext();

  const handleOpen = useCallback(() => {
    unlockPosition();
    setIsOpen(true);
  }, [unlockPosition]);

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
        position={position}
        middlewares={middlewares}
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

const DEFAULT_POSITION: FloatingPosition = "bottom-start";

// Content can shrink while the popover is open (searching, collapsing sections), and flip would then
// move it back to the default side. Keep the side it was first placed on until it's opened again.
// Mantine's `preventPositionChangeWhenVisible` can lock before the first flip resolves, and
// `onPositionChange` doesn't fire when it reopens on the same side, so read the placement from `size`,
// which runs after flip on every update.
function usePositionLockedWhileOpen() {
  const [lockedPosition, setLockedPosition] = useState<FloatingPosition>();

  const middlewares = useMemo<PopoverProps["middlewares"]>(
    () => ({
      ...DEFAULT_POPOVER_MIDDLEWARES,
      flip: lockedPosition === undefined,
      size: {
        ...DEFAULT_POPOVER_MIDDLEWARES.size,
        // a custom `apply` replaces Mantine's default sizing, so re-apply it
        apply: ({ placement, availableWidth, availableHeight, elements }) => {
          Object.assign(elements.floating.style, {
            maxWidth: `${availableWidth}px`,
            maxHeight: `${availableHeight}px`,
          });
          setLockedPosition((position) => position ?? placement);
        },
      },
    }),
    [lockedPosition],
  );

  const unlockPosition = useCallback(() => setLockedPosition(undefined), []);

  return {
    position: lockedPosition ?? DEFAULT_POSITION,
    middlewares,
    unlockPosition,
  };
}
