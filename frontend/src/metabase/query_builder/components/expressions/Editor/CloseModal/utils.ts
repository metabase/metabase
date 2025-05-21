import { useCallback, useEffect, useState } from "react";

import { usePreventPopoverExit } from "metabase/ui/components/utils/PreventPopoverExit";

/**
 * useCloseModal sets up click handlers that prevent clicks the would cause the modal
 * to close from firing unless allowPopoverExit is true.
 *
 * If the element that was clicked is an active element (ie. button, input, etc.),
 * the confirmation modal is shown.
 * If the element is not an active element, the confirmation modal is not shown, but
 * the click is prevented from closing the popover.
 * If the element has data-ignore-editor-clicks="true", the click behavior
 * works as normal (ie. to make sure nested popovers keep working).
 *
 */
export function useCloseModal({
  allowPopoverExit = false,
}: {
  allowPopoverExit?: boolean;
} = {}) {
  const [showModal, setShowModal] = useState(false);

  usePreventPopoverExit({
    popoverIsExitable: allowPopoverExit,
  });

  // We need to attach our own click handler that triggers in the capture phase
  // to prevent other click handlers from firing first.
  // This means we cannot useClickOutside from Mantine.
  useEffect(() => {
    if (allowPopoverExit) {
      return;
    }

    function handler(event: MouseEvent) {
      if (isInActiveElement(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        setShowModal(true);
      }
    }

    window.addEventListener("click", handler, { capture: true });
    return () => {
      window.removeEventListener("click", handler, { capture: true });
    };
  }, [allowPopoverExit]);

  const closeModal = useCallback(() => {
    setShowModal(false);
  }, []);

  return { showModal, closeModal };
}

function isInActiveElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const active = [
    "button",
    "input",
    "textarea",
    "select",
    "radio",
    "checkbox",
    "[aria-controls]",
    "[aria-haspopup]",
    "[aria-role=button]",
    "[role=button]",
  ];

  let parent = null;
  for (const selector of active) {
    if (target.matches(selector)) {
      parent = target;
      break;
    }
    const closest = target.closest(selector);
    if (closest) {
      parent = closest;
      break;
    }
  }

  if (
    parent?.matches("[data-ignore-editor-clicks=true]") ||
    parent?.closest("[data-ignore-editor-clicks=true]")
  ) {
    return false;
  }

  return Boolean(parent);
}
