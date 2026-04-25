import { type RefObject, createContext, useContext } from "react";

export const ScrollContainerContext =
  createContext<RefObject<HTMLElement | null> | null>(null);

export const ScrollContainerProvider = ScrollContainerContext.Provider;

export function useScrollContainer(): HTMLElement | null {
  const ref = useContext(ScrollContainerContext);
  return ref?.current ?? null;
}
