import { useEffect, useState } from "react";

export function useLoadingTimer(isLoading: any, timer: number) {
  const [trigger, setTrigger] = useState(false);

  useEffect(() => {
    if (isLoading) {
      const timeoutId = setTimeout(() => {
        if (isLoading) {
          setTrigger(true);
        }
      }, timer);
      return () => clearTimeout(timeoutId);
    }
  }, [isLoading, timer]);

  return trigger;
}
