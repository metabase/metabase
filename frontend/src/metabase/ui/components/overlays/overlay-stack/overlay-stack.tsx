import {
  useContext,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
} from "react";
import { useLatest } from "react-use";

import { OverlayStackContext } from "./overlay-stack-provider";

const useOverlayStackStore = () => {
  const store = useContext(OverlayStackContext);
  if (!store) {
    throw new Error(
      "Overlay components must be rendered within an OverlayStackProvider",
    );
  }
  return store;
};

const useIsTopmost = (opened: boolean) => {
  const id = useId();
  const store = useOverlayStackStore();
  const currentStack = useSyncExternalStore(store.subscribe, store.getStack);

  useEffect(() => {
    if (!opened) {
      return;
    }
    store.push(id);
    return () => store.remove(id);
  }, [opened, id, store]);

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
    const takeSnapshot = () => setSnapshot(isTopmostRef.current);
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
