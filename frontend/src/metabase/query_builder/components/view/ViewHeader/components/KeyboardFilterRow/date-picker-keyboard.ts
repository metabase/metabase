import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";
import { t } from "ttag";

/**
 * Prototype: keyboard support for the date pickers of a pill: the fixed date
 * range and the relative date range pickers. They are the shared pickers of
 * the filter picker, so this works from the outside of them, on the popover,
 * and leaves them as they are. Tab and Enter work in them already: they are
 * forms with an Apply button. (The exclude values are a list of the pill, see
 * ExcludeDateValueInput.)
 */

/** Inputs that take typed text, like the dates and the number of days. A Mantine input has no `type`. A Select's input is read-only. */
const TEXT_INPUT_SELECTOR = [
  "input:not([type]):not([readonly]):not([disabled])",
  'input[type="text"]:not([readonly]):not([disabled])',
].join(", ");

/** Buttons other than the tabs and Apply, like the units of "Current". */
const BUTTON_SELECTOR =
  'button:not([role="tab"]):not([type="submit"]):not([disabled])';

/**
 * The element that gets the focus when the picker opens or changes screens:
 * the first input, like the start date, or else the first button. Not the
 * back button.
 */
function getFirstFocusTarget(root: HTMLElement) {
  const backLabel = t`Back`;
  return (
    root.querySelector<HTMLElement>(TEXT_INPUT_SELECTOR) ??
    Array.from(root.querySelectorAll<HTMLElement>(BUTTON_SELECTOR)).find(
      (button) => button.getAttribute("aria-label") !== backLabel,
    )
  );
}

/** Enter on a switch, like "Include today", applies, unless Apply is disabled. */
function submitForm(form: HTMLFormElement) {
  const submitButton = form.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  if (submitButton != null && !submitButton.disabled) {
    form.requestSubmit(submitButton);
  }
}

export function useDatePickerKeyboard() {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  // The picker takes the focus when it opens. Later, a part of the picker
  // that goes away can take the focus with it. When the focus is lost, it
  // goes to the first input of the picker.
  useEffect(() => {
    if (root == null) {
      return;
    }
    getFirstFocusTarget(root)?.focus();
    const focusIfLost = () => {
      const activeElement = document.activeElement;
      if (activeElement == null || activeElement === document.body) {
        getFirstFocusTarget(root)?.focus();
      }
    };
    const observer = new MutationObserver(focusIfLost);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [root]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target;
    if (
      event.key === "Enter" &&
      target instanceof HTMLInputElement &&
      target.type === "checkbox" &&
      target.form != null
    ) {
      event.preventDefault();
      submitForm(target.form);
    }
  };

  return { ref: setRoot, onKeyDown: handleKeyDown };
}
