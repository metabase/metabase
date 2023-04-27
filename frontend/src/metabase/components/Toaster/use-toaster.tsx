import React, {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
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
  size: "small" | "medium";
}
type ShowToaster = (props: ShowToasterProps) => void;
type HideToaster = () => void;

export function useToaster(): [ToasterApi, ReactNode] {
  const [isShown, setIsShown] = useState<boolean>(false);
  const [options, setOptions] = useState<Omit<ShowToasterProps, "duration">>();
  const durationRef = useRef<number>(DEFAULT_TOASTER_DURATION);

  const timer = useRef<ReturnType<typeof setTimeout>>();
  const cancelTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
  };

  const hide: HideToaster = useCallback(() => {
    setIsShown(false);
    cancelTimer();
  }, []);

  const show: ShowToaster = useCallback(
    ({ duration = DEFAULT_TOASTER_DURATION, ...options }) => {
      durationRef.current = duration;
      setIsShown(true);
      setOptions(options);
    },
    [],
  );

  useEffect(() => {
    return cancelTimer;
  }, []);

  const toaster = options ? (
    <Toaster isShown={isShown} fixed onDismiss={hide} {...options} />
  ) : null;

  const api = useMemo(
    () => ({
      show,
      hide,
    }),
    [hide, show],
  );

  return [api, toaster];
}
