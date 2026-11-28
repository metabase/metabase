import { useLayoutEffect, useSyncExternalStore } from "react";

// PROTOTYPE: how many space-name headings (which open the space switcher) are
// on screen. While any is, the "No top nav" variant hides the top-right space
// switcher; screens without one keep it, so there's always a way to switch.
let mountedCount = 0;
const listeners = new Set<() => void>();

function setMountedCount(count: number) {
  mountedCount = count;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Registers a mounted space-switcher heading for as long as it's mounted. */
export function useRegisterSpaceSwitcherHeading() {
  useLayoutEffect(() => {
    setMountedCount(mountedCount + 1);
    return () => setMountedCount(mountedCount - 1);
  }, []);
}

/** Whether any space-switcher heading is on screen. */
export function useIsSpaceSwitcherHeadingShown(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => mountedCount > 0,
    () => false,
  );
}
