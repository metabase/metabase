import { useRef, useEffect, useMemo, useState } from "react";

export function useAsyncFunction(fn) {
  const [isPending, setIsPending] = useState(false);
  const isUnmountedRef = useRef(false);

  useEffect(() => {
    () => {
      isUnmountedRef.current = true;
    };
  }, []);

  const safeFn = useMemo(() => {
    return (...args) =>
      new Promise((resolve, reject) => {
        setIsPending(true);
        return fn(...args)
          .then(res => {
            if (!isUnmountedRef.current) {
              resolve(res);
            }
            setIsPending(false);
          })
          .catch(err => {
            if (!isUnmountedRef.current) {
              reject(err);
            }
            setIsPending(false);
          });
      });
  }, [fn]);

  return [safeFn, isPending];
}
