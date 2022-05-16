import { useRef, useCallback } from "react";

import { AsyncFn, AsyncReturnType } from "metabase-types/types";

export function useMostRecentCall<T extends AsyncFn>(asyncFn: T) {
  const promiseRef = useRef<Promise<any>>();

  return useCallback<(...args: Parameters<T>) => Promise<AsyncReturnType<T>>>(
    (...args) => {
      const promise = asyncFn(...args);
      promiseRef.current = promise;

      return new Promise((resolve, reject) => {
        return promise
          .then((res: AsyncReturnType<T>) => {
            if (promiseRef.current === promise) {
              resolve(res);
            }
          })
          .catch((err: Error) => {
            if (promiseRef.current === promise) {
              reject(err);
            }
          });
      });
    },
    [asyncFn],
  );
}
