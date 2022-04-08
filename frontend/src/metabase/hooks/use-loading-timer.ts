import { useEffect, useState } from "react";

interface loadingTimerProps {
  timer: number;
  onTimeout: () => void;
}

export function useLoadingTimer(isLoading: any, props: loadingTimerProps) {
  const [trigger, setTrigger] = useState(false);
  const { onTimeout, timer } = props;

  useEffect(() => {
    if (isLoading) {
      const timeoutId = setTimeout(() => {
        if (isLoading) {
          setTrigger(true);
          if (onTimeout) {
            onTimeout();
          }
        }
      }, timer);
      return () => clearTimeout(timeoutId);
    }
  }, [isLoading, timer, onTimeout]);

  return trigger;
}
