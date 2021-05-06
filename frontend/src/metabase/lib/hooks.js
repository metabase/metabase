import { useRef, useEffect, useMemo, useState } from "react";

// wraps the given async function in a promise that does not resolve
// after the component has unmounted
export function useAsyncFunction(fn) {
  const [isPending, setIsPending] = useState(false);
  const isUnmountedRef = useRef(false);

  useEffect(() => {
    return () => {
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
              setIsPending(false);
              resolve(res);
            }
          })
          .catch(err => {
            if (!isUnmountedRef.current) {
              setIsPending(false);
              reject(err);
            }
          });
      });
  }, [fn]);

  return [safeFn, isPending];
}
