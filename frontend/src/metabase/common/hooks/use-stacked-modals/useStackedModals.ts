import { useState } from "react";
import { useMount } from "react-use";
import _ from "underscore";

type Props<TKeys extends string> = {
  modals: TKeys[];
  defaultOpened?: TKeys;
  withOverlay: boolean;
};

type GetModalPropsReturn = {
  /**
   * to support both Sidesheet and mantine's Modal property.
   * To fix it rename Sidesheet's prop
   */
  opened: boolean;
  isOpen: boolean;
  onClose: () => void;
  closeOnEscape: boolean;
  withOverlay: boolean;
  withTransparentOverlay: boolean;
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

  const getModalProps = (
    key: TKeys,
    // TODO(egorgrushin): introduce mergeProps pattern
    override?: Partial<GetModalPropsReturn>,
  ): GetModalPropsReturn =>
    _.defaults(override, {
      isOpen: state[key] ?? false,
      opened: state[key] ?? false,
      onClose: () => close(key),
      closeOnEscape: key === currentModal,
      withOverlay,
      /** Invisible overlay to prevent double darkening while preserving click-outside handling */
      withTransparentOverlay: withOverlay && key !== firstOpenedModal,
    });

  return {
    currentModal,
    getModalProps,
    open,
    close,
  };
};
