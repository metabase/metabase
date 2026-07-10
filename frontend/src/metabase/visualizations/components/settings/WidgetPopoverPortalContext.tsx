import { createContext } from "react";

export type WidgetPopoverPortal = {
  dropdownTarget: HTMLElement;
  scrollContainer: HTMLElement;
};

export const WidgetPopoverPortalContext =
  createContext<WidgetPopoverPortal | null>(null);
