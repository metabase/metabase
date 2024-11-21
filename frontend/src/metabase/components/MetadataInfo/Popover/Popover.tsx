import type { MouseEvent, ReactNode } from "react";
import { useCallback, useState } from "react";

import useSequencedContentCloseHandler from "metabase/hooks/use-sequenced-content-close-handler";
import type { HoverCardProps } from "metabase/ui";
import { HoverCard, useDelayGroup } from "metabase/ui";

const POPOVER_TRANSITION_DURATION = 150;

// When switching to another hover target in the same delay group,
// we don't close immediately but delay by a short amount to avoid flicker.
const POPOVER_CLOSE_DELAY = 180;

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
  openDelay?: number;
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
        onMouseEnter={stopPropagation}
        onMouseLeave={stopPropagation}
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
