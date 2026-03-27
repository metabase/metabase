import type { MouseEvent, ReactNode } from "react";
import { useCallback, useState } from "react";

import { useSequencedContentCloseHandler } from "metabase/common/hooks/use-sequenced-content-close-handler";
import Animation from "metabase/css/core/animation.module.css";
import type { HoverCardProps } from "metabase/ui";
import { HoverCard, useDelayGroup } from "metabase/ui";

// Initially, the user will have to hover for this long to open the popover
const POPOVER_SLOW_OPEN_DELAY = 250;

// When an item in the same delay group is already open, we want to open the
// popover immediately, without waiting for the user to hover for POPOVER_SLOW_OPEN_DELAY.
// This way the user can move the cursor between hover targets and get feedback immediately.
//
// When opening fast, we still delay a little bit to avoid a flickering popover
// when the target is being clicked.
const POPOVER_FAST_OPEN_DELAY = 150;

// When switching to another hover target in the same delay group,
// we don't close immediately but delay by a short amount to avoid flicker.
const POPOVER_CLOSE_DELAY = POPOVER_FAST_OPEN_DELAY + 30;

import { Dropdown, WidthBound } from "./Popover.styled";

export type PopoverProps = Pick<
  HoverCardProps,
  "children" | "position" | "disabled"
> & {
  width?: number;
  content: ReactNode;
  openDelay?: number;
};

export function Popover({
  position = "bottom-start",
  disabled,
  content,
  openDelay = POPOVER_SLOW_OPEN_DELAY,
  width,
  children,
}: PopoverProps) {
  const group = useDelayGroup();

  const [isOpen, setIsOpen] = useState(false);

  const { setupCloseHandler, removeCloseHandler } =
    useSequencedContentCloseHandler();

  const handleOpen = useCallback(() => {
    group.onOpen();
    setIsOpen(true);
  }, [group]);

  const handleClose = useCallback(() => {
    removeCloseHandler();
    group.onClose();
    setIsOpen(false);
  }, [removeCloseHandler, group]);

  return (
    <HoverCard
      position={position}
      disabled={disabled}
      openDelay={group.shouldDelay ? openDelay : POPOVER_FAST_OPEN_DELAY}
      closeDelay={POPOVER_CLOSE_DELAY}
      onOpen={handleOpen}
      onClose={handleClose}
      middlewares={{
        size: true,
        shift: true,
        flip: false,
      }}
    >
      <HoverCard.Target>{children}</HoverCard.Target>
      <Dropdown
        onClick={stopPropagation}
        onMouseDown={stopPropagation}
        onMouseUp={stopPropagation}
        className={group.shouldDelay ? Animation.fadeIn : undefined}
      >
        <WidthBound
          width={width}
          ref={(node) => {
            setupCloseHandler(node, () => setIsOpen(false));
          }}
        >
          {isOpen && content}
        </WidthBound>
      </Dropdown>
    </HoverCard>
  );
}

function stopPropagation(evt: MouseEvent) {
  evt.stopPropagation();
}
