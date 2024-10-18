import type { MouseEvent, ReactNode } from "react";
import { useCallback, useState } from "react";

import useSequencedContentCloseHandler from "metabase/hooks/use-sequenced-content-close-handler";
import type { HoverCardProps } from "metabase/ui";
import { HoverCard, useDelayGroup } from "metabase/ui";

const POPOVER_TRANSITION_DURATION = 150;

// Initially, the user will have to hover for this long to open the popover
const POPOVER_SLOW_OPEN_DELAY = 1000;

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

import {
  Dropdown,
  HackyInvisibleTargetFiller,
  WidthBound,
} from "./Popover.styled";

export type PopoverProps = Pick<
  HoverCardProps,
  "children" | "position" | "disabled"
> & {
  width?: number;
  content: ReactNode;
};

export function Popover({
  position = "bottom-start",
  disabled,
  content,
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
      openDelay={
        group.shouldDelay ? POPOVER_SLOW_OPEN_DELAY : POPOVER_FAST_OPEN_DELAY
      }
      closeDelay={POPOVER_CLOSE_DELAY}
      onOpen={handleOpen}
      onClose={handleClose}
      transitionProps={{
        duration: group.shouldDelay ? POPOVER_TRANSITION_DURATION : 0,
      }}
      middlewares={{
        shift: true,
        flip: false,
      }}
    >
      <HoverCard.Target>{children}</HoverCard.Target>
      <Dropdown
        onClick={stopPropagation}
        onMouseDown={stopPropagation}
        onMouseUp={stopPropagation}
      >
        {/* HACK: adds an element between the target and the card */}
        {/* to avoid the card from disappearing */}
        <HackyInvisibleTargetFiller />
        <WidthBound
          width={width}
          ref={node => {
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
