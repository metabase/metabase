import { createContext, useMemo, useState } from "react";

export type WidgetPopoverPortal = {
  dropdownTarget: HTMLElement;
  scrollContainer: HTMLElement;
};

export const WidgetPopoverPortalContext =
  createContext<WidgetPopoverPortal | null>(null);

/**
 * Lets a popover host chart setting widgets whose dropdowns aren't clipped.
 * Render `dropdownTarget` as a non-clipping wrapper around `scrollContainer`,
 * and give the popover `styles={{ dropdown: { overflow: "visible" } }}` so its
 * own dropdown doesn't clip either.
 */
export const useWidgetPopoverPortal = () => {
  const [dropdownTarget, setDropdownTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
    null,
  );

  const value = useMemo(
    () =>
      dropdownTarget && scrollContainer
        ? { dropdownTarget, scrollContainer }
        : null,
    [dropdownTarget, scrollContainer],
  );

  return { value, setDropdownTarget, setScrollContainer, scrollContainer };
};
