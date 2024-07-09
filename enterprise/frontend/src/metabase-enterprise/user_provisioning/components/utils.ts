import { useCallback, useState } from "react";

export const useModal = (initialValue = false) => {
  const [opened, setOpened] = useState<boolean>(initialValue);
  const open = useCallback(() => setOpened(true), []);
  const close = useCallback(() => setOpened(false), []);
  const toggle = useCallback(() => setOpened(current => !current), []);
  return { opened, open, close, toggle };
};
