import React, {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useToggle } from "metabase/hooks/use-toggle";
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
  // XXX: Cleanup the logic here. Possibly using `react-use`'s `useTimeout`
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [isShown, setIsShown] = useState<boolean>(false);
  const [hovered, { turnOn: setHovered, turnOff: setNotHovered }] = useToggle();
  const [options, setOptions] = useState<Omit<ShowToasterProps, "duration">>();
  const durationRef = useRef<number>(DEFAULT_TOASTER_DURATION);

  const hide: HideToaster = useCallback(() => {
    setIsShown(false);
    if (timer.current) {
      clearTimeout(timer.current);
    }
  }, []);

  const show: ShowToaster = useCallback(
    ({ duration = DEFAULT_TOASTER_DURATION, ...options }) => {
      durationRef.current = duration;
      timer.current = setTimeout(() => {
        // setVisibilityStatus("timingOut");
        if (timer.current) {
          clearTimeout(timer.current);
        }
      }, durationRef.current);
      setIsShown(true);
      setOptions(options);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isShown && !hovered) {
      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(hide, durationRef.current);
    }

    if (isShown && hovered) {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    }
  }, [hide, hovered, isShown]);

  const toaster = options ? (
    <Toaster
      isShown={isShown}
      fixed
      onDismiss={hide}
      onMouseEnter={setHovered}
      onMouseLeave={setNotHovered}
      {...options}
    />
  ) : null;

  const api = {
    show,
    hide,
  };

  return [api, toaster];
}
