import React, {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import Toaster, { DEFAULT_TOASTER_DURATION } from ".";

interface ToasterApi {
  show: ShowToaster;
  hide: HideToaster;
}

interface ShowToasterProps {
  message: string;
  confirmText: string;
  onConfirm: () => void;
  duration?: number;
}
type ShowToaster = (props: ShowToasterProps) => void;
type HideToaster = () => void;

export function useToaster(): [ToasterApi, ReactNode] {
  // XXX: Cleanup the logic here. Possibly using `react-use`'s `useTimeout`
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [isShown, setIsShown] = useState<boolean>(false);
  const [options, setOptions] = useState<Omit<ShowToasterProps, "duration">>();

  const hide: HideToaster = useCallback(() => {
    setIsShown(false);
    if (timer.current) {
      clearTimeout(timer.current);
    }
  }, []);

  const show: ShowToaster = useCallback(
    ({ duration = DEFAULT_TOASTER_DURATION, ...options }) => {
      timer.current = setTimeout(hide, duration);
      setIsShown(true);
      setOptions(options);
    },
    [hide],
  );

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const api = {
    show,
    hide,
  };

  const toaster = options ? (
    <Toaster isShown={isShown} fixed onDismiss={hide} {...options} />
  ) : null;

  return [api, toaster];
}
