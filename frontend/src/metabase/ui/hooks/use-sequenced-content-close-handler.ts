import { useCallback, useRef } from "react";
import _ from "underscore";

import { isElement } from "metabase-types/guards";

type PopoverData = {
  contentEl: Element;
  backdropEl?: Element;
  ignoreEl?: Element;
  close: (e: MouseEvent | KeyboardEvent) => void;
};

export const RENDERED_POPOVERS: PopoverData[] = [];

function isEventInsideElement(e: Event, el: Element) {
  const target = e.composedPath()[0];
  return isElement(target) && el.contains(target);
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
        isEventInsideElement(e, popoverData.backdropEl)) &&
      (!popoverData.ignoreEl || !isEventInsideElement(e, popoverData.ignoreEl))
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

export function useSequencedContentCloseHandler() {
  const popoverDataRef = useRef<PopoverData>();

  const handleEvent = useCallback((e: MouseEvent | KeyboardEvent) => {
    if (
      popoverDataRef.current &&
      shouldClosePopover(e, popoverDataRef.current)
    ) {
      popoverDataRef.current.close(e);
    }
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
    (contentEl: Element | null, close: () => void) => {
      removeCloseHandler();

      if (isElement(contentEl)) {
        const popover = { contentEl, close };
        RENDERED_POPOVERS.push(popover);
        popoverDataRef.current = popover;

        document.addEventListener("keydown", handleEvent);
        window.addEventListener("mousedown", handleEvent, true);
      }
    },
    [handleEvent, removeCloseHandler],
  );

  return { setupCloseHandler, removeCloseHandler };
}
