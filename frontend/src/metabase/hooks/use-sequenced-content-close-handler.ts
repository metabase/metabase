import { useCallback, useEffect, useRef } from "react";
import _ from "underscore";
import * as tippy from "tippy.js";

type TippyInstance = tippy.Instance;

type PopoverData = {
  triggerEl: Element;
  contentEl: Element;
  backdropEl?: Element;
  close: (e: MouseEvent | KeyboardEvent) => void;
};

export const RENDERED_POPOVERS: PopoverData[] = [];

function isElement(a: any): a is Element {
  return a instanceof Element;
}

function isEventInsideElement(e: Event, el: Element) {
  return isElement(e.target) && el.contains(e.target);
}

export function removePopoverData(popoverData: PopoverData) {
  const index = RENDERED_POPOVERS.indexOf(popoverData);
  if (index >= 0) {
    RENDERED_POPOVERS.splice(index, 1);
  }
}

export function shouldClosePopover(
  e: MouseEvent | KeyboardEvent,
  popoverData: PopoverData,
) {
  const mostRecentPopover = _.last(RENDERED_POPOVERS);

  if (e instanceof MouseEvent) {
    return (
      mostRecentPopover &&
      mostRecentPopover === popoverData &&
      !isEventInsideElement(e, mostRecentPopover.contentEl) &&
      (!popoverData.backdropEl ||
        isEventInsideElement(e, popoverData.backdropEl))
    );
  }

  if (e instanceof KeyboardEvent) {
    return (
      mostRecentPopover &&
      mostRecentPopover === popoverData &&
      e.key === "Escape"
    );
  }

  console.warn("Unsupported event type", e);
  return false;
}

export default function useSequencedContentCloseHandler() {
  const popoverDataRef = useRef<PopoverData>();
  // A cheap hack to prevent popovers from being closed more than 1 time
  // in a single sequence e.g. After users click there will be 2 events; mousedown -> click.
  const closedPopoverDuringMouseSequenceRef = useRef<PopoverData>();

  const handleEvent = useCallback((e: MouseEvent | KeyboardEvent) => {
    if (e instanceof MouseEvent) {
      if (
        popoverDataRef.current &&
        shouldClosePopover(e, popoverDataRef.current) &&
        !closedPopoverDuringMouseSequenceRef.current
      ) {
        closedPopoverDuringMouseSequenceRef.current = popoverDataRef.current;
        popoverDataRef.current.close(e);
      }
    } else {
      // keyboard event
      if (
        popoverDataRef.current &&
        shouldClosePopover(e, popoverDataRef.current)
      ) {
        popoverDataRef.current.close(e);
      }
    }
  }, []);

  // Prevent toggling the popover after closing it with `mousedown`
  const handleClickEvent = useCallback((e: MouseEvent) => {
    if (closedPopoverDuringMouseSequenceRef.current?.triggerEl === e.target) {
      e.stopPropagation();
    }

    closedPopoverDuringMouseSequenceRef.current = undefined;
  }, []);

  const removeCloseHandler = useCallback(() => {
    if (popoverDataRef.current) {
      removePopoverData(popoverDataRef.current);
      popoverDataRef.current = undefined;
    }

    document.removeEventListener("keydown", handleEvent);
    window.removeEventListener("mousedown", handleEvent, true);
  }, [handleEvent]);

  const setupCloseHandler = useCallback(
    (instance: TippyInstance, close: () => void) => {
      removeCloseHandler();

      if (isElement(instance.popper)) {
        const popover = {
          triggerEl: instance.reference,
          contentEl: instance.popper,
          close,
        };
        RENDERED_POPOVERS.push(popover);
        popoverDataRef.current = popover;

        document.addEventListener("keydown", handleEvent);
        window.addEventListener("mousedown", handleEvent, true);
      }
    },
    [handleEvent, removeCloseHandler],
  );

  useEffect(() => {
    window.addEventListener("click", handleClickEvent, true);
    return () => {
      window.removeEventListener("click", handleClickEvent, true);
    };
  }, [handleClickEvent]);

  return { setupCloseHandler, removeCloseHandler };
}
