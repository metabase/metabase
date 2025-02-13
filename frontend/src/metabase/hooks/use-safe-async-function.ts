import { useCallback } from "react";
import { useMountedState } from "react-use";

type AsyncFn = (...args: any[]) => Promise<any>;

/**
 * wraps the given async function in a promise that does not resolve after the component has unmounted
 * @deprecated — use `useAsyncFn` from react-use instead
 */
export function useSafeAsyncFunction(fn: AsyncFn, deps?: any[]): AsyncFn {
  const isMounted = useMountedState();

  const safeFn: AsyncFn = useCallback(
    (...args: any[]) =>
      new Promise((resolve, reject) => {
        return fn(...args)
          .then((res: any) => {
            if (isMounted()) {
              resolve(res);
            }
          })
          .catch((err: Error) => {
            if (isMounted()) {
              reject(err);
            }
          });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps ? [...deps, isMounted] : [isMounted],
  );

  return safeFn;
}
