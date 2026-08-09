import { createContext, useMemo, useState } from "react";

export type WidgetPopoverPortal = {
  dropdownTarget: HTMLElement;
  scrollContainer: HTMLElement;
};

export const WidgetPopoverPortalContext =
  createContext<WidgetPopoverPortal | null>(null);

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
