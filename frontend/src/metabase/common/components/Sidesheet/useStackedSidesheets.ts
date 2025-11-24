import { useState } from "react";
import { useMount } from "react-use";
import _ from "underscore";

type Props<TKeys extends string> = {
  sidesheets: TKeys[];
  defaultOpened?: TKeys;
  withOverlay: boolean;
};

type GetModalPropsReturn = {
  isOpen: boolean;
  onClose: () => void;
  closeOnEscape: boolean;
  withOverlay: boolean;
  withTransparentOverlay: boolean;
};

export const useStackedSidesheets = <TKeys extends string>({
  sidesheets,
  defaultOpened,
  withOverlay = true,
}: Props<TKeys>) => {
  const [state, setState] = useState<Partial<Record<TKeys, boolean>>>(() =>
    sidesheets.reduce((memo: Partial<Record<TKeys, boolean>>, key) => {
      memo[key] = false;
      return memo;
    }, {}),
  );
  const [stack, setStack] = useState<TKeys[]>([]);

  const currentSidesheet = stack.at(-1);
  const firstOpenedSidesheet = stack.at(0);

  const closeSidesheet = (key: TKeys) => {
    setState((prev) => ({ ...prev, [key]: false }));
    setStack((prev) => prev.slice(0, -1));
  };

  const openSidesheet = (key: TKeys) => {
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
    openSidesheet(defaultOpened);
  });

  const getModalProps = (
    key: TKeys,
    // TODO(egorgrushin): introduce mergeProps pattern
    override?: Partial<GetModalPropsReturn>,
  ): GetModalPropsReturn =>
    _.defaults(override, {
      isOpen: state[key] ?? false,
      onClose: () => closeSidesheet(key),
      closeOnEscape: key === currentSidesheet,
      withOverlay,
      /** Invisible overlay to prevent double darkening while preserving click-outside handling */
      withTransparentOverlay: withOverlay && key !== firstOpenedSidesheet,
    });

  return {
    currentSidesheet,
    getModalProps,
    openSidesheet,
    closeSidesheet,
  };
};
