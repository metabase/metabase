import { useCallback, useEffect, useState } from "react";

import { usePreventPopoverExit } from "metabase/ui/components/utils/PreventPopoverExit";

export function useCloseModal({
  allowPopoverExit = false,
}: {
  allowPopoverExit?: boolean;
} = {}) {
  const [showModal, setShowModal] = useState(false);
  usePreventPopoverExit({
    popoverIsExitable: allowPopoverExit,
  });
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
