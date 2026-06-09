import { useEffect, useRef, useState } from "react";

import { useSequencedContentCloseHandler } from "metabase/ui/hooks/use-sequenced-content-close-handler";

type UseModalCloseHandlerProps = {
  opened: boolean;
  onClose?: () => void;
  closeOnClickOutside: boolean;
  closeOnEscape: boolean;
};

const isEventInside = (event: Event, element: Element) => {
  const target = event.composedPath()[0];
  return target instanceof Node && element.contains(target);
};

/**
 * This hook hooks to useSequencedContentCloseHandler which guards modals
 * from closing if there is a MenuDropdown/TippyPopover/Popover.
 * This also fixes a bug when we can't
 */
export const useModalCloseHandler = ({
  opened,
  onClose,
  closeOnClickOutside,
  closeOnEscape,
}: UseModalCloseHandlerProps) => {
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const { setupCloseHandler, removeCloseHandler } =
    useSequencedContentCloseHandler();

  const optionsRef = useRef({ onClose, closeOnClickOutside, closeOnEscape });
  optionsRef.current = { onClose, closeOnClickOutside, closeOnEscape };

  useEffect(() => {
    if (!opened || !rootEl) {
      return;
    }

    /**
     * This is the only way to get ref to the content here.
     * Mantine doesn't provide contentRef prop for Modal component.
     * It's only available for compound components which is not the case.
     */
    const contentEl = rootEl.querySelector("[data-modal-content]") ?? rootEl;

    const close = (event?: MouseEvent | KeyboardEvent) => {
      if (!event) {
        return;
      }

      const { onClose, closeOnClickOutside, closeOnEscape } =
        optionsRef.current;

      if (event instanceof KeyboardEvent) {
        // We disable Mantine's native closeOnEscape, so we have to replicate
        // its escape handling. Mantine's Combobox-based inputs (Select,
        // MultiSelect, Autocomplete) set data-mantine-stop-propagation="true"
        // on the focused input while their dropdown is open, and they don't
        // register in RENDERED_POPOVERS. Without this check, pressing Escape to
        // close an open dropdown would also close the modal underneath it.
        const target = event.target;
        const stopsPropagation =
          target instanceof HTMLElement &&
          target.getAttribute("data-mantine-stop-propagation") === "true";

        if (closeOnEscape && !stopsPropagation) {
          onClose?.();
        }
        return;
      }

      if (closeOnClickOutside && isEventInside(event, rootEl)) {
        onClose?.();
      }
    };

    setupCloseHandler(contentEl, close);

    return () => removeCloseHandler();
  }, [opened, rootEl, setupCloseHandler, removeCloseHandler]);

  return setRootEl;
};
