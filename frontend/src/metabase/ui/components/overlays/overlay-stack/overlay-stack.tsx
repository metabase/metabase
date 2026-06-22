import {
  useContext,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import { useLatest } from "react-use";

import { OverlayStackContext } from "./overlay-stack-provider";

const useOverlayStackContext = () => {
  const context = useContext(OverlayStackContext);
  if (!context) {
    throw new Error(
      "Overlay components must be rendered within an OverlayStackProvider",
    );
  }
  return context;
};

const useIsTopmost = (opened: boolean) => {
  const id = useId();
  const context = useOverlayStackContext();
  const currentStack = useSyncExternalStore(
    context.subscribe,
    context.getStack,
  );

  useEffect(() => {
    if (!opened) {
      return;
    }
    context.push(id);
    return () => context.remove(id);
  }, [opened, id, context]);

  return opened && currentStack.at(-1) === id;
};

// Overlays dismiss on different pointer phases: menus/popovers close on the
// `mousedown` (pointer down) that lands outside, while modals close on the
// following `click`. By the time a modal's click fires, the menu above it has
// already closed and the modal has become topmost — so gating click-outside on
// the *current* topmost would let the click leak through and close the modal.
// We instead snapshot topmost-ness at pointer down (before any closing happens)
// and gate the click against that snapshot.
const useIsTopmostAtPointerDown = (isTopmost: boolean, opened: boolean) => {
  const isTopmostRef = useLatest(isTopmost);
  const [snapshot, setSnapshot] = useState(isTopmost);

  useEffect(() => {
    if (!opened) {
      return;
    }
    // The snapshot is committed with flushSync so the re-render lands synchronously
    // within the pointer-down handler, before the `click` fires. A real user leaves
    // time between the two events for React to re-render on its own, but Cypress
    // dispatches pointerdown→click in one synchronous burst, so without flushSync
    // the click would still read the stale snapshot and skip the close.
    const takeSnapshot = () =>
      flushSync(() => setSnapshot(isTopmostRef.current));
    document.addEventListener("pointerdown", takeSnapshot, true);
    return () =>
      document.removeEventListener("pointerdown", takeSnapshot, true);
  }, [opened, isTopmostRef]);

  return snapshot;
};

type GatedCloseProps = {
  opened?: boolean;
  closeOnEscape?: boolean;
  closeOnClickOutside?: boolean;
};

export const useGatedCloseProps = ({
  opened = true,
  closeOnEscape,
  closeOnClickOutside,
}: GatedCloseProps) => {
  const isTopmost = useIsTopmost(opened);
  const isTopmostAtPointerDown = useIsTopmostAtPointerDown(isTopmost, opened);

  return {
    closeOnEscape: isTopmost ? closeOnEscape : false,
    closeOnClickOutside: isTopmostAtPointerDown ? closeOnClickOutside : false,
  };
};

export const OverlayStackItem = () => {
  useIsTopmost(true);
  return null;
};
