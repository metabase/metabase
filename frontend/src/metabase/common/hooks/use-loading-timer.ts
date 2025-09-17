import { useEffect } from "react";

interface LoadingTimerProps {
  timer: number;
  onTimeout: () => void;
}

export function useLoadingTimer(isLoading: boolean, props: LoadingTimerProps) {
  const { onTimeout, timer } = props;
  useEffect(() => {
    if (isLoading) {
      const timeoutId = setTimeout(() => {
        if (isLoading) {
          onTimeout();
        }
      }, timer);
      return () => clearTimeout(timeoutId);
    }
  }, [isLoading, timer, onTimeout]);
}
