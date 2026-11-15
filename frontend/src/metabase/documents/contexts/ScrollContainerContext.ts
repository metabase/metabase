import { createContext, useContext } from "react";

export const ScrollContainerContext = createContext<HTMLElement | null>(null);

export const ScrollContainerProvider = ScrollContainerContext.Provider;

export function useScrollContainer(): HTMLElement | null {
  return useContext(ScrollContainerContext);
}
