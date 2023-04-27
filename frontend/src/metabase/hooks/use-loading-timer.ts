import { useEffect } from "react";

interface LoadingTimerProps {
  timer: number;
  onTimeout: () => void;
}

export function useLoadingTimer(isLoading: boolean, props: LoadingTimerProps) {
  const { onTimeout, timer } = props;
  useEffect(() => {
    if (isLoading) {
      // XXX: drive-by refactor
      // It doesn't make much sense to have `isLoading`
      // in the timeout because it's guaranteed to be true
      // since the first `if (isLoading)` block.
      // In this case we could just pass the `onTimeout` callback
      // to the `setTimeout` function directly.
      const timeoutId = setTimeout(onTimeout, timer);
      return () => clearTimeout(timeoutId);
    }
  }, [isLoading, timer, onTimeout]);
}
