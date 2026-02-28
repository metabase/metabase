import { useCallback, useRef } from "react";

type Subscriber<T> = (event: T) => void;

export const useSubscriber = <T>() => {
  const subscribersRef = useRef<Set<Subscriber<T>>>(new Set());

  const emit = useCallback((event: T) => {
    for (const subscriber of subscribersRef.current) {
      subscriber(event);
    }
  }, []);

  const subscribe = useCallback((cb: Subscriber<T>) => {
    subscribersRef.current.add(cb);
    return () => {
      subscribersRef.current.delete(cb);
    };
  }, []);

  return { emit, subscribe };
};
