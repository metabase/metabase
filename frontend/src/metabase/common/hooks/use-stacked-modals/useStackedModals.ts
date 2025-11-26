import { useState } from "react";
import { useMount } from "react-use";

import type { ModalOverlayProps } from "metabase/ui";

type Props<TKeys extends string> = {
  modals: TKeys[];
  defaultOpened?: TKeys;
  withOverlay: boolean;
};

type GetModalPropsReturn = {
  isOpen: boolean;
  onClose: () => void;
  closeOnEscape: boolean;
  withOverlay: boolean;
  overlayProps?: ModalOverlayProps;
};

export const useStackedModals = <TKeys extends string>({
  modals,
  defaultOpened,
  withOverlay = true,
}: Props<TKeys>) => {
  const [state, setState] = useState<Partial<Record<TKeys, boolean>>>(() =>
    modals.reduce((memo: Partial<Record<TKeys, boolean>>, key) => {
      memo[key] = false;
      return memo;
    }, {}),
  );
  const [stack, setStack] = useState<TKeys[]>([]);

  const currentModal = stack.at(-1);
  const firstOpenedModal = stack.at(0);

  const close = (key: TKeys) => {
    setState((prev) => ({ ...prev, [key]: false }));
    setStack((prev) => prev.slice(0, -1));
  };

  const open = (key: TKeys) => {
    setState((prev) => ({ ...prev, [key]: true }));
    setStack((prev) => [...prev, key]);
  };

  useMount(() => {
    if (!defaultOpened) {
      return;
    }
    // the modal is not rendered until it is "open"
    // but we want to set it open after it mounts to get
    // pretty animations
    open(defaultOpened);
  });

  const getModalProps = (key: TKeys): GetModalPropsReturn => ({
    isOpen: state[key] ?? false,
    onClose: () => close(key),
    closeOnEscape: key === currentModal,
    withOverlay,
    /** Invisible overlay to prevent double darkening while preserving click-outside handling */
    overlayProps:
      withOverlay && key !== firstOpenedModal
        ? {
            bg: "transparent",
          }
        : undefined,
  });

  return {
    currentModal,
    getModalProps,
    open,
    close,
  };
};
