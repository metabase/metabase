import { useCallback, useRef } from "react";

type Subscriber<T> = (event: T) => void;

type UseSubscriberOptions = {
  /** When true, all emitted events are buffered and replayed to new subscribers */
  withBuffer?: boolean;
};

export const useSubscriber = <T>({ withBuffer }: UseSubscriberOptions = {}) => {
  const subscribersRef = useRef<Set<Subscriber<T>>>(new Set());
  const bufferRef = useRef<T[]>([]);

  const emit = useCallback(
    (event: T) => {
      if (withBuffer) {
        bufferRef.current.push(event);
      }
      for (const subscriber of subscribersRef.current) {
        subscriber(event);
      }
    },
    [withBuffer],
  );

  const subscribe = useCallback(
    (cb: Subscriber<T>) => {
      subscribersRef.current.add(cb);
      if (withBuffer) {
        for (const event of bufferRef.current) {
          cb(event);
        }
      }
      return () => {
        subscribersRef.current.delete(cb);
      };
    },
    [withBuffer],
  );

  return { emit, subscribe };
};
