import { useCallback, useState } from "react";

type ModalHookResult = {
  opened: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

export const useModal = (initialValue = false): ModalHookResult => {
  const [opened, setOpened] = useState<boolean>(initialValue);
  const open = useCallback(() => setOpened(true), []);
  const close = useCallback(() => setOpened(false), []);
  const toggle = useCallback(() => setOpened(current => !current), []);
  return { opened, open, close, toggle };
};
