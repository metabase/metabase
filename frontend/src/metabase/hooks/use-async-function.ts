import { useCallback } from "react";
import { useIsMounted } from "./use-is-mounted";

type AsyncFn = (...args: any[]) => Promise<any>;

// wraps the given async function in a promise that does not resolve
// after the component has unmounted
export function useAsyncFunction(fn: AsyncFn): AsyncFn {
  const isMounted = useIsMounted();

  const safeFn: AsyncFn = useCallback(
    (...args: any[]) =>
      new Promise((resolve, reject) => {
        return fn(...args)
          .then((res: any) => {
            if (isMounted) {
              resolve(res);
            }
          })
          .catch((err: Error) => {
            if (isMounted) {
              reject(err);
            }
          });
      }),
    [fn, isMounted],
  );

  return safeFn;
}
